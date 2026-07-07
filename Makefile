# Demo environment orchestration for the demo-main branch.
# See demo/README.md for full documentation.

# Slim set of docker dependencies for demos (minio/azurite are added
# automatically by server/Makefile). Skips prometheus/grafana/loki/otel.
DEMO_DOCKER_SERVICES ?= postgres inbucket redis

.PHONY: demo demo-seed demo-stop demo-reset help

demo: ## Start everything: docker deps, server, seed data, webapp watch build
	cd server && ENABLED_DOCKER_SERVICES="$(DEMO_DOCKER_SERVICES)" $(MAKE) run-server
	MAX_WAIT_SECONDS=300 bash demo/seed.sh
	@echo ""
	@echo "Server is up at http://localhost:8065 (auto-login as lucas)."
	@echo "Starting the webapp watch build — keep this terminal open."
	@echo "First build can take a few minutes; refresh the browser when it finishes."
	@echo ""
	cd webapp && $(MAKE) run

demo-seed: ## (Re-)run the seed script against an already-running server
	bash demo/seed.sh

demo-stop: ## Stop the webapp watcher, the server, and the docker containers
	cd webapp && $(MAKE) stop
	cd server && $(MAKE) stop-server
	cd server && ENABLED_DOCKER_SERVICES="$(DEMO_DOCKER_SERVICES)" $(MAKE) stop-docker

demo-reset: demo-stop ## Stop everything and wipe the database (next `make demo` reseeds)
	cd server && ENABLED_DOCKER_SERVICES="$(DEMO_DOCKER_SERVICES)" $(MAKE) clean-docker
	@echo ""
	@echo "Database wiped. Run 'make demo' to start fresh and reseed."

help:
	@grep -E '^[0-9a-zA-Z_-]+:.*?## .*$$' ./Makefile | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
