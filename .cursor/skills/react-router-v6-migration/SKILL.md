---
name: react-router-v6-migration
description: >-
  Standardized approach for migrating the Mattermost webapp from react-router-dom
  v5 to v6 using the react-router-dom-v5-compat strangler pattern. Use when working
  on any react-router migration ticket, converting Switch/Route/withRouter/useHistory
  code to v6 APIs, or when a task mentions react-router, CompatRouter, CompatRoute,
  useNavigate, or the react-router-migration Linear project.
---

# React Router v5 → v6 Migration (Mattermost webapp)

## Strategy in one paragraph

We migrate incrementally using [`react-router-dom-v5-compat`](https://github.com/remix-run/react-router/discussions/8753), which runs v6 in parallel with v5 inside the same tree. Both APIs work simultaneously; untouched code keeps running v5 unchanged. Migration proceeds **bottom-up**: convert one `<Route>` inside a `<Switch>` to `<CompatRoute>`, migrate every component in that route's element tree to v6 APIs, repeat for all routes in the `<Switch>`, then convert that `<Switch>` to `<Routes>`, and move up the tree. The final cutover (swap the dependency to real v6, remove compat) happens only after everything is converted. **Never do a big-bang upgrade** — a lock-file-only bump was already rejected (PR #34902).

## Sources of truth

- Linear project: [Mattermost - React Router Migration](https://linear.app/lucas-marketing-agent/project/mattermost-react-router-migration-b22d2cc99262/overview) — ticket scoping and sequencing live here.
- Upstream playbook: [remix-run/react-router discussion #8753](https://github.com/remix-run/react-router/discussions/8753) and the [react-router-dom-v5-compat README](https://www.npmjs.com/package/react-router-dom-v5-compat).
- Prior art: [mattermost/mattermost PR #30912](https://github.com/mattermost/mattermost/pull/30912) (`upstream/react-router-dom-v6` branch) — adds the `CompatRouter` foundation.
- Codebase inventory and API conversion tables: [reference.md](reference.md) in this skill.

## Hard rules

1. **One `<Switch>` scope per PR/ticket.** A unit of work is: all routes in one `<Switch>` converted to `<CompatRoute>` + their element trees on v6 hooks + the `<Switch>` flipped to `<Routes>`. Don't leave a `<Switch>` half-converted across PRs unless the ticket says so.
2. **Bottom-up only.** Never convert a parent `<Switch>` before all descendant `<Switch>`es are on `<Routes>`. Descendant paths become relative when the parent converts — converting top-down breaks matching silently.
3. **Do not touch the plugin contract until the final-cutover ticket.** `window.ReactRouterDom` (in `webapp/channels/src/plugins/export.ts`) and `window.WebappUtils.browserHistory` must keep exposing v5 APIs; external plugins compile against them via webpack externals.
4. **Do not remove `getHistory()`** (`webapp/channels/src/utils/browser_history.tsx`) during route conversions. Imperative navigation from Redux thunks (~98 files) is handled by its own dedicated ticket, not opportunistically.
5. **No behavior changes.** Every PR must be a pure refactor: same URLs match, same redirects fire, same query strings survive. If a route's behavior must change to fit v6, flag it in the PR description explicitly.
6. **Keep CI green and tests migrated in the same PR.** Update `tests/react-router-dom_mock.ts` mocks and `renderWithContext` usage alongside the components they cover.

## Workflow per ticket

```
- [ ] 1. Read the ticket and reference.md; identify the target <Switch> and its route files
- [ ] 2. Survey: grep the element tree for v5 APIs (useHistory, withRouter,
        RouteComponentProps, match., useRouteMatch, Redirect, Prompt)
- [ ] 3. Convert leaf components first: hooks/HOCs → v6 equivalents (see reference.md tables)
- [ ] 4. Convert each <Route> in the target <Switch> to <CompatRoute> (element prop, no
        component=/render=); verify the app still routes correctly after each one
- [ ] 5. When all routes in the Switch are CompatRoutes and their trees are v6-only,
        replace <Switch> with <Routes>, make descendant paths relative, drop `exact`
- [ ] 6. Update tests; run webapp checks (below)
- [ ] 7. PR per .github/PULL_REQUEST_TEMPLATE.md; note which Switch was converted and
        paste the v5-API grep count before/after for the touched directory
```

Verification commands (from `webapp/`):

```bash
npm run check-types --workspace=channels
npm run lint --workspace=channels          # use npx eslint <files> for a subset
npm run test --workspace=channels -- <changed test paths>
```

For manual smoke-testing use `make demo` from the repo root (auto-logs-in as `lucas`) and click through the converted routes: deep-link the URL directly, navigate away and back, and check browser back/forward.

## v6 gotchas that bite in this codebase

- `<CompatRoute>` only works **inside a `<Switch>`**. Standalone `<Route>`s (rendered outside a Switch) need a different treatment — usually `useMatch`.
- v6 paths have **no regex and no optional params**. Repeat the route once per variant instead.
- `exact` is gone; v6 matches exactly by default. Routes with descendants need a trailing `/*`.
- Descendant routes inside a converted `<Routes>` use **relative paths** — stop building paths from `match.path`/`match.url`.
- `useNavigate` replaces `history.push/replace`; `navigate(to, {replace: true})`. In effects, `navigate` is a stable function but the linter will want it in deps.
- Connected components reading `ownProps.match` in `mapStateToProps` (~28 files) can't get `match` as a prop in v6. Move param reads into the component via `useParams`, or wrap with a small function component that calls hooks and passes explicit props to the connected component.
- The desktop-app shim in `browser_history.tsx` wraps `history.push`. Route conversions don't affect it, but never navigate around it — always go through `getHistory()` or router hooks.

## Delegation pattern (for subagents / cloud agents)

- Use an **explore subagent** at the start of a ticket to inventory v5 API usage under the target directory (counts per pattern, file list). Don't skip this — the inventory in reference.md is a snapshot and drifts.
- Run a **Bugbot review** (`review-bugbot` skill) on the branch before opening the PR; route refactors regress silently and the diff-level review catches missed `exact`/relative-path conversions.
- Large tickets (e.g. the admin console tree) may be split across parallel subagents **only along independent `<Switch>` boundaries**, never within one Switch.

## Additional resources

- [reference.md](reference.md) — v5→v6 API conversion tables, the full codebase hotspot inventory (file paths and counts), and the phase plan matching the Linear tickets.
