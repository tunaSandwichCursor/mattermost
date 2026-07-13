# Demo environment orchestration for the demo-main branch.
# See demo/README.md for full documentation.

# Slim set of docker dependencies for demos (minio/azurite are added
# automatically by server/Makefile). Skips prometheus/grafana/loki/otel.
DEMO_DOCKER_SERVICES ?= postgres inbucket redis

DEBUG_AGENT_DIR := demo/debug-agent
DEBUG_AGENT_PID := $(DEBUG_AGENT_DIR)/.agent.pid
MMCTL := server/bin/mmctl

.PHONY: demo demo-seed demo-stop demo-reset demo-agent demo-agent-dry demo-agent-provision demo-agent-bg demo-agent-kill help

demo: ## Start everything: docker, server, seed, @debug bridge, webapp watch
	cd server && ENABLED_DOCKER_SERVICES="$(DEMO_DOCKER_SERVICES)" $(MAKE) run-server
	MAX_WAIT_SECONDS=300 bash demo/seed.sh
	@$(MAKE) demo-agent-bg
	@echo ""
	@echo "Server is up at http://localhost:8065 (auto-login as lucas)."
	@echo "@debug bridge is running in the background (make demo-stop kills it)."
	@echo "Starting the webapp watch build — keep this terminal open."
	@echo "First build can take a few minutes; refresh the browser when it finishes."
	@echo ""
	cd webapp && $(MAKE) run

demo-seed: ## (Re-)run the seed script against an already-running server
	bash demo/seed.sh

demo-agent-provision: ## Create/update the @debug bot, token, and channel memberships
	@if [ ! -x "$(MMCTL)" ]; then cd server && $(MAKE) mmctl-build; fi
	@$(MMCTL) --local config set ServiceSettings.EnableBotAccountCreation true
	python3 $(DEBUG_AGENT_DIR)/provision.py

demo-agent-kill: ## Stop any running @debug bridge processes
	@if [ -f "$(DEBUG_AGENT_PID)" ]; then \
		kill $$(cat "$(DEBUG_AGENT_PID)") 2>/dev/null || true; \
		rm -f "$(DEBUG_AGENT_PID)"; \
	fi
	@pkill -f "debug-agent/node_modules/.bin/tsx src/index.ts" 2>/dev/null || true
	@sleep 1

demo-agent-bg: demo-agent-provision demo-agent-kill ## Provision @debug and start the bridge in the background
	@if [ ! -d "$(DEBUG_AGENT_DIR)/node_modules" ]; then \
		echo "==> Installing debug-agent npm dependencies..."; \
		cd $(DEBUG_AGENT_DIR) && npm install; \
	fi
	@echo "==> Starting @debug bridge in the background (needs CURSOR_API_KEY in demo/debug-agent/.env)"
	@cd $(DEBUG_AGENT_DIR) && \
		nohup npm start < /dev/null > /tmp/debug-agent.log 2>&1 & echo $$! > $(DEBUG_AGENT_PID); \
	sleep 2; \
	if kill -0 $$(cat "$(DEBUG_AGENT_PID)") 2>/dev/null; then \
		echo "    started pid $$(cat $(DEBUG_AGENT_PID)); logs: /tmp/debug-agent.log"; \
	else \
		echo "    bridge failed to stay up — check /tmp/debug-agent.log (is CURSOR_API_KEY set?)"; \
		rm -f "$(DEBUG_AGENT_PID)"; \
		exit 1; \
	fi

demo-agent: demo-agent-provision demo-agent-kill ## Provision @debug and start the Cursor SDK bridge (foreground)
	@if [ ! -d "$(DEBUG_AGENT_DIR)/node_modules" ]; then \
		echo "==> Installing debug-agent npm dependencies..."; \
		cd $(DEBUG_AGENT_DIR) && npm install; \
	fi
	@echo "==> Starting @debug bridge (Ctrl+C to stop). Requires CURSOR_API_KEY unless dry-run."
	@cd $(DEBUG_AGENT_DIR) && \
		npm start & echo $$! > .agent.pid; \
		pid=$$(cat .agent.pid); \
		trap 'kill $$pid 2>/dev/null; rm -f .agent.pid' INT TERM EXIT; \
		wait $$pid; \
		rm -f .agent.pid

demo-agent-dry: demo-agent-provision demo-agent-kill ## Start the bridge in dry-run mode (no CURSOR_API_KEY)
	@if [ ! -d "$(DEBUG_AGENT_DIR)/node_modules" ]; then \
		echo "==> Installing debug-agent npm dependencies..."; \
		cd $(DEBUG_AGENT_DIR) && npm install; \
	fi
	@echo "==> Starting @debug bridge in DEBUG_AGENT_DRY_RUN=1 mode"
	@cd $(DEBUG_AGENT_DIR) && \
		npm run start:dry & echo $$! > .agent.pid; \
		pid=$$(cat .agent.pid); \
		trap 'kill $$pid 2>/dev/null; rm -f .agent.pid' INT TERM EXIT; \
		wait $$pid; \
		rm -f .agent.pid

demo-stop: ## Stop the webapp watcher, debug-agent, server, and docker containers
	@if [ -f "$(DEBUG_AGENT_PID)" ]; then \
		pid=$$(cat $(DEBUG_AGENT_PID)); \
		echo "Stopping debug-agent (pid $$pid)..."; \
		kill $$pid 2>/dev/null || true; \
		pkill -P $$pid 2>/dev/null || true; \
		rm -f $(DEBUG_AGENT_PID); \
	fi
	@pkill -f "tsx src/index.ts" 2>/dev/null || true
	cd webapp && $(MAKE) stop
	cd server && $(MAKE) stop-server
	cd server && ENABLED_DOCKER_SERVICES="$(DEMO_DOCKER_SERVICES)" $(MAKE) stop-docker

demo-reset: demo-stop ## Stop everything and wipe the database (next `make demo` reseeds)
	cd server && ENABLED_DOCKER_SERVICES="$(DEMO_DOCKER_SERVICES)" $(MAKE) clean-docker
	@echo ""
	@echo "Database wiped. Run 'make demo' to start fresh and reseed."
	@echo "Note: demo/debug-agent/.env.local may hold a stale token; provision.py will refresh it."

help:
	@grep -E '^[0-9a-zA-Z_-]+:.*?## .*$$' ./Makefile | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
