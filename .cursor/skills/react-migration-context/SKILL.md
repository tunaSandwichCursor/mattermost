---
name: react-migration-context
description: >-
  Loads the status, history, and plan of the Mattermost webapp React migration
  (react-router-dom v5 → v6, and the React 18 → 19 upgrade that landed upstream
  but not in this fork). Use at the start of any migration slice or ticket, when a
  task mentions React Router, react-router-dom-v5-compat, CompatRouter, React 19,
  the CUR-5…CUR-10 Linear tickets, or asks "what is the state of the React migration".
---

# React migration context (Mattermost webapp)

Read this first, then hand off to the slice-specific skill. This skill says **what** is done, what is left, and which slice is next. [`react-router-v6-migration`](../react-router-v6-migration/SKILL.md) says **how** to convert a router slice. Do not repeat its rules here; follow them.

Snapshot taken 2026-10-29 on `demo-main`. Re-check the "Verify the snapshot" commands before relying on any number.

## What "the React migration" means

There are two separate tracks. Don't mix them in one PR.

| Track | Fork (`demo-main`) | Upstream `mattermost/mattermost` master | Owner in this fork |
|---|---|---|---|
| **React Router v5 → v6** (the migration attempted here) | `react-router-dom@5.3.4`, `history@4.10.1`, no compat package | Also still `5.3.4`. Upstream never migrated | Linear project [Mattermost - React Router Migration](https://linear.app/lucas-marketing-agent/project/mattermost-react-router-migration-b22d2cc99262/overview), CUR-5…CUR-10 |
| **React 18 → 19** | `react`/`react-dom@18.2.0`, `@types/react@18.2.64`. Concurrent React is an opt-in user setting (`EnableConcurrentReact`, #36785) | `19.3.1`. Landed via the #38311 chain (Sep 2026) | None. `demo-main` forked from upstream at #37340 (2026-07-07), before that chain |

**Default: "React migration" means the router track.** React 19 only comes into this fork through an upstream sync. Don't re-implement it by hand. If a task asks for React 19, stop and confirm scope with the requester first.

## Router track: status

| Phase / ticket | State | Artifact |
|---|---|---|
| Skill (how-to playbook) | Landed v1 on `demo-main` (commit `0a691351af`). Rewrite with a verified inventory, 13 ordered units and `scripts/survey.sh` is **open, not merged** | [fork PR #1](https://github.com/tunaSandwichCursor/mattermost/pull/1), branch `cursor/react-router-v6-migration-skill-5e4e` |
| Phase 1 Foundation (CUR-5) | **Open, not merged.** Adds `react-router-dom-v5-compat@6.30.6`, `<CompatRouter>` in `app.tsx`, and v6 context in `renderWithContext`. The full Jest suite passed and Bugbot reported success | [fork PR #2](https://github.com/tunaSandwichCursor/mattermost/pull/2), branch `cursor/react-router-v6-phase-1-compat-router-3ff7` |
| Phase 2 leaf trees (CUR-6) | Not started | — |
| Phase 3 team/channel core (CUR-7) | Not started | — |
| Phase 4 `root.tsx` + route wrappers (CUR-8) | Not started | — |
| Phase 5 `getHistory()` imperative nav (CUR-9) | Not started | — |
| Phase 6 cutover + plugin contract (CUR-10) | Not started | — |

All CUR tickets are still in Todo in Linear, even though PR #2 exists for CUR-5.

### Prior attempts (why we go incrementally)

| Link | Outcome |
|---|---|
| [mattermost-webapp#11562](https://github.com/mattermost/mattermost-webapp/pull/11562) | Merged 2022, a patch bump only (5.3.3 → 5.3.4). v6 was judged a whole-app change |
| [mattermost/mattermost#30912](https://github.com/mattermost/mattermost/pull/30912) | Upstream `<CompatRouter>` PR. Open, stale, never reviewed. PR #2 above re-created it instead of rebasing it |
| [mattermost/mattermost#34902](https://github.com/mattermost/mattermost/pull/34902) | Snyk bump to 6.30.2, closed: "cannot upgrade major version with just a lock file change" |

### Upstream React 19 chain (reference only)

[#38313](https://github.com/mattermost/mattermost/pull/38313) type codemods, [#38337](https://github.com/mattermost/mattermost/pull/38337) dependency bumps, [#38391](https://github.com/mattermost/mattermost/pull/38391) always `createRoot`, [#38390](https://github.com/mattermost/mattermost/pull/38390) standalone fixes, and [#38311](https://github.com/mattermost/mattermost/pull/38311) the 19 bump all merged. [#37520](https://github.com/mattermost/mattermost/pull/37520) (test branch) and [#38070](https://github.com/mattermost/mattermost/pull/38070) (MUI upgrade) were closed.

## Router track: what is left (13 Switches in 11 files)

Bottom-up order. Each row is one PR, and a row starts only after its dependencies merge. Paths are under `webapp/channels/src/components/`.

| # | Switch | Depends on | Phase |
|---|---|---|---|
| 1 | `integrations/commands_container/commands_container.tsx` | — | 2 |
| 2 | `channel_layout/center_channel/center_channel.tsx` | — | 3 |
| 3 | `admin_console/admin_console.tsx` | — | 2 |
| 4 | `rhs_popout/rhs_popout.tsx` | — | 4 |
| 5 | `mfa/mfa_controller/mfa_controller.tsx` | — | 4 |
| 6 | `create_team/create_team.tsx` | — | 4 |
| 7 | `claim/claim_controller.tsx` | — | 4 |
| 8 | `backstage/backstage_controller.tsx` | 1 | 2 |
| 9 | `popout_controller/popout_controller.tsx` | 4 | 4 |
| 10 | `team_controller/team_controller.tsx` | 2, 8 | 3 |
| 11 | `root/root.tsx`, `/admin_console` inner Switch | 3 | 4 |
| 12 | `root/root.tsx`, `main-wrapper` Switch | 10 | 4 |
| 13 | `root/root.tsx`, top-level Switch + `LoggedInRoute`/`HFRoute`/`HFTRoute` | 5, 6, 7, 9, 11, 12 | 4 |

After the Switches: Phase 5 (the `getHistory()` call sites) and Phase 6 (dependency swap, delete compat and `history@4`, version `window.ReactRouterDom` for plugins).

### Recommended slice sequence

1. Merge PR #1 so the router skill's unit table and `survey.sh` are on `demo-main`.
2. Merge PR #2 (Foundation, CUR-5). Nothing else may start before this.
3. Slice 1, `commands_container`: the smallest leaf, and it proves the per-Switch workflow end to end.
4. Slices 3 and 8 (`admin_console`, `backstage`) to finish CUR-6.
5. Slice 2 then 10 (CUR-7). The independent leaves 4–7 can run in parallel with these.
6. Slices 9, 11, 12, 13 (CUR-8), then CUR-9, then CUR-10.

## Snapshot inventory (`webapp/channels/src`, non-test files)

| Pattern | Files |
|---|---|
| Imports from `react-router-dom` | 155 |
| `getHistory()` | 67 |
| `useHistory` | 36 |
| `RouteComponentProps` | 22 |
| `withRouter` | 12 |
| `matchPath` | 10 |
| `useRouteMatch` | 8 |
| `<Redirect` | 8 |

## Key paths

- `components/app.tsx` holds `<Router history={getHistory()}>`. Foundation adds `<CompatRouter>` here.
- `utils/browser_history.tsx` holds the history@4 singleton, the desktop `push` shim, and the `module_registry` override.
- `components/root/root.tsx` has three Switches and `doesRouteBelongToTeamControllerRoutes`, which keeps its own regex copy of the team routes.
- `utils/path.ts` holds `TEAM_NAME_PATH_PATTERN` and `ID_PATH_PATTERN`. Those regex route constraints don't exist in v6.
- Tests: `tests/react-router-dom_mock.ts` globally mocks `useHistory`/`getHistory`, and `tests/react_testing_utils.tsx` provides `renderWithContext`.
- Plugin contract: `plugins/export.ts` exposes `window.ReactRouterDom`, `WebappUtils.browserHistory`, `window.React` and `window.ReactDOM`. `webapp/platform/shared/build/webpack-web-app-externals.cjs` and `types/store/plugins.ts` belong to it too.
- `webapp/channels/webpack.config.js` holds the Module Federation shared-singleton list.

## Pitfalls learned so far

- **No big-bang upgrades.** A dependency-only bump was rejected upstream (#34902).
- **The plugin contract breaks silently.** React 19 left the app stuck on its loading spinner because plugins read `createRoot` from `window.ReactDOM` (#38311). The router cutover has the same risk with `window.ReactRouterDom`, so leave it frozen until CUR-10.
- **v6 `navigate()` passes a location object to the v5 history**, not a string. Assertions on `historyMock.push` need `expect.objectContaining` (from PR #2).
- **The test harness needs its own compat router.** The global `useHistory` mock desynchronizes the real `CompatRouter`. PR #2 adds `TestCompatRouter` to fix this.
- **Thread routing bounce:** `useThreadRouting().clear()` in `components/threading/hooks.ts` calls `history.replace` without checking that the route is still current. Upstream fixed it in #38311, where React 19 Suspense timing made it reproducible. The bug is still present on `demo-main`. Keep that guard when converting this hook.
- **Regex params, first-match ordering vs. most-specific ranking, and catch-alls** are covered in the router skill. Read its gotchas before flipping a Switch.
- **Demo-only files never go into migration PRs:** the root `Makefile` demo targets, `demo/`, and the auto-login block in `components/login/login.tsx`.

## How to use this skill

1. Run "Verify the snapshot" below. If PR #1 or #2 merged or a Switch is gone, update the status tables in this file in your PR.
2. Pick the next unblocked row from "Recommended slice sequence" or your ticket, and confirm its dependencies merged.
3. Open the router skill and follow its per-ticket checklist.
4. In the PR description, name the unit, link the CUR ticket, and paste before/after counts.

## Verify the snapshot

From the repo root:

```bash
grep -E '"(react|react-dom|react-router-dom|react-router-dom-v5-compat|history)"' webapp/channels/package.json
rg -n '<Switch[ >]' webapp/channels/src --glob '!**/*.test.*'
rg -l "from 'react-router-dom'" webapp/channels/src --glob '!**/*.test.*' --glob '!**/tests/**' | wc -l
gh pr view 1 -R tunaSandwichCursor/mattermost --json state; gh pr view 2 -R tunaSandwichCursor/mattermost --json state
```
