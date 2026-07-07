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
4. Start the webapp watch build in the foreground.

Then open **http://localhost:8065**. You'll be signed in automatically as
`lucas`. The first webapp build takes a few minutes; refresh once it finishes.

Requirements: Docker running, Go, Node/npm (`make demo` installs webapp npm
dependencies automatically if missing), Python 3 (ships with macOS).

## Commands

| Command | What it does |
| --- | --- |
| `make demo` | Start everything (docker, server, seed, webapp) |
| `make demo-stop` | Stop the webapp watcher, server, and docker containers |
| `make demo-reset` | Stop everything and **wipe the database**; next `make demo` reseeds |
| `make demo-seed` | Re-run the seeder against an already-running server (no-op if already seeded) |

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
