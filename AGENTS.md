# AGENTS.md

Explicitly import subdirectory instruction files that must always be in context:
@server/AGENTS.md

## Running the app (demo-main branch)

This branch is a demo environment. To run the entire app (Docker
dependencies, server, seed data, and webapp) with one command from the repo
root:

```
make demo
```

The app is served at http://localhost:8065 and automatically signs in as the
primary demo user `lucas` (password `Password123!`, system admin). Other
commands: `make demo-stop` stops everything, `make demo-reset` wipes the
database so the next `make demo` reseeds, `make demo-seed` re-runs the seeder.
Full details, seeded accounts, and the auto-login escape hatch are documented
in `demo/README.md`.

Do not merge this branch's demo changes (root `Makefile`, `demo/`, and the
auto-login block in `webapp/channels/src/components/login/login.tsx`) into
`master`.

## Pull Requests

When creating a pull request, follow `.github/PULL_REQUEST_TEMPLATE.md` exactly:

- Remove all `<!-- -->` comments.
- Omit sections that are not applicable (Ticket Link, Screenshots) — do not write N/A, just remove the header.
- The `#### Release Note` header and its "```release-note" fenced code block **must always be present** (WITHOUT escaping the ``` characters). Write `NONE` if the change has no API, schema, UI, or breaking changes.

## Cursor Cloud Agents

This repository has a checked-in Cloud Agent environment under `.cursor/`. Docker is started by `.cursor/scripts/cloud-agent-start.sh`; if Docker is unavailable in Cloud, treat that as an environment failure rather than falling back to snapshot assumptions.

This fork has no access to the private `mattermost/enterprise` repo, so the environment declares no repository dependencies and the server builds as Team Edition.
