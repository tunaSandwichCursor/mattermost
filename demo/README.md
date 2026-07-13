# Demo environment (`demo-main` branch)

This branch turns the repo into a demo-ready Mattermost instance: one command
to run everything, pre-seeded realistic data, and automatic sign-in as the
primary demo user.

## Quick start

```bash
make demo
```

Run from the repo root. This will, in order:

1. Start the Docker dependencies (postgres, inbucket, redis, minio, azurite).
2. Compile and start the Mattermost server in the background on port 8065.
3. Seed demo data (first run only — the script is idempotent).
4. Provision `@debug` and start the Cursor SDK bridge in the background.
5. Start the webapp watch build in the foreground.

Then open **http://localhost:8065**. You'll be signed in automatically as
`lucas`. The first webapp build takes a few minutes; refresh once it finishes.

Requires `CURSOR_API_KEY` in [`demo/debug-agent/.env`](demo/debug-agent/.env)
(gitignored). Bridge logs go to `/tmp/debug-agent.log`.

Requirements: Docker running, Go, Node/npm (`make demo` installs webapp npm
dependencies automatically if missing), Python 3 (ships with macOS).

## Commands

| Command | What it does |
| --- | --- |
| `make demo` | Start everything (docker, server, seed, `@debug` bridge, webapp) |
| `make demo-stop` | Stop the webapp watcher, `@debug` bridge, server, and docker containers |
| `make demo-reset` | Stop everything and **wipe the database**; next `make demo` reseeds |
| `make demo-seed` | Re-run the seeder against an already-running server (no-op if already seeded) |
| `make demo-agent` | Start only the `@debug` bridge in the foreground (server already up) |
| `make demo-agent-dry` | Same as `demo-agent`, but dry-run (no `CURSOR_API_KEY` needed) |
| `make demo-agent-provision` | Only create/update the bot, token, and channel memberships |

## Accounts

| User | Password | Notes |
| --- | --- | --- |
| `lucas` | `Password123!` | Primary demo user, system admin, **auto-logged-in** |
| `maya.chen`, `dev.patel`, `sofia.reyes`, `jordan.brooks`, `sam.okafor`, `elena.novak`, `kai.tanaka`, `ryan.mills` | `Demo123!` | Named cast of the curated Demo HQ team |
| `sysadmin` | `Sys@dmin-sample1` | Secondary admin from sample data |
| `user-1` | `SampleUs@r-1` | Regular sample user (other generated users have random `first.last` usernames) |
| `guest` | `SampleGu@st1` | Guest account |

## What's seeded

- **Demo HQ team** — curated, demo-friendly content: `product`, `engineering`,
  `design`, `launch-atlas`, `incidents`, and `watercooler` channels with
  realistic conversations, threads, mentions, reactions, pinned posts, and
  custom user statuses.
- **3 generated teams** — 40 users, 8 channels each, ~80 posts per channel,
  plus DMs and group messages (via `mmctl sampledata`), for volume and
  scrollback.
- `lucas` is a member of every team and public channel. Everything is marked
  read except a couple of fresh channel mentions and two DM threads, so the
  app opens with a small, believable unread state.

## Auto-login

The login page (`webapp/channels/src/components/login/login.tsx`) signs in as
`lucas` automatically when served from `localhost`. This is a demo-branch-only
change — do not merge it to `master`.

- To see the real login screen or switch users, visit
  `http://localhost:8065/login?no_auto_login=1`, or just log out (auto-login
  runs at most once per browser tab).

## Resetting between demos

`make demo-reset` wipes the Postgres volume. The next `make demo` reseeds
from scratch, giving you an identical starting state every time. Seeded
content is deterministic (`--seed 42`) except post timestamps, which are
relative to when you seed.

## @debug bot (Cursor SDK)

The demo includes an at-mentionable **`@debug`** bot backed by the
[Cursor SDK](https://cursor.com/docs/sdk/typescript). Mention it in any
public channel (or DM it) and it investigates this repo with a Cursor
agent, narrating a few progress steps in the thread before posting an
answer. Follow-up mentions in the same thread resume the same agent.

### Quick start

1. Put your key in [`demo/debug-agent/.env`](demo/debug-agent/.env) (`CURSOR_API_KEY=...`).
2. Run `make demo` — that starts the app **and** the `@debug` bridge.
3. In the app, open any channel (e.g. `engineering`) and post:

```text
@debug what does the make demo target do?
```

You'll see a link to view the run in Cursor, a couple of real progress
milestones from the agent, then the final answer in-thread.

To restart only the bridge (server already up): `make demo-agent`.

### Dry-run (no API key)

To exercise Mattermost plumbing without calling Cursor:

```bash
make demo-agent-dry
# then, in another shell:
python3 demo/debug-agent/scripts/smoke.py
```

### Notes

- The bot is joined to **every team and public channel** at provision time so
  `@debug` resolves anywhere. DMs work without membership.
- Mentions require the literal `@debug` text — `@channel` / `@all` / `@here`
  alone will not trigger the agent.
- After `make demo-reset`, the next `make demo` re-provisions the bot (stale
  tokens in `demo/debug-agent/.env.local` are refreshed automatically).
- The bridge is demo-branch-only — do not merge `demo/debug-agent/` to `master`.
