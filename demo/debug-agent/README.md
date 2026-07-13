# @debug agent bridge

TypeScript companion service for the Mattermost demo. Authenticates as the
`debug` bot, listens for `@debug` mentions over WebSocket, runs a Cursor SDK
agent, and posts real progress milestones plus a view-run link in the thread.

## Commands

From the **repo root**:

```bash
make demo-agent          # provision + start (needs CURSOR_API_KEY)
make demo-agent-dry      # provision + start without Cursor
make demo-agent-provision
```

From this directory:

```bash
npm install
DEBUG_AGENT_DRY_RUN=1 npm start
python3 provision.py
python3 scripts/smoke.py   # bridge must already be running in dry-run
```

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MATTERMOST_BOT_TOKEN` | yes | from `.env.local` | Written by `provision.py` |
| `CURSOR_API_KEY` | unless dry-run | — | User or service-account key |
| `MATTERMOST_URL` | no | `http://localhost:8065` | |
| `CURSOR_MODEL` | no | `composer-2.5` | |
| `DEBUG_AGENT_RUNTIME` | no | `cloud` | `cloud` = viewable in Agents UI; `local` = disk checkout |
| `CURSOR_CLOUD_REPO` | no | `https://github.com/tunaSandwich/mattermost.git` | Must be accessible to your Cursor GitHub connection |
| `CURSOR_CLOUD_REF` | no | `master` | Starting git ref for cloud clone |
| `DEBUG_AGENT_DRY_RUN` | no | unset | `1` skips the SDK |
| `DEBUG_AGENT_TIMEOUT_MS` | no | `300000` | Per-run timeout |
| `DEBUG_AGENT_REPO_ROOT` | no | repo root | Local agent `cwd` |

Cloud runs open at `https://cursor.com/agents/<agentId>` (Filter → Source → SDK if needed).
