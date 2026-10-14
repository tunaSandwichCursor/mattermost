---
name: react-router-v6-migration
description: >-
  Standardized approach for migrating the Mattermost webapp from react-router-dom
  v5 to v6 using the react-router-dom-v5-compat strangler pattern. Use when working
  on any react-router migration ticket, converting Switch/Route/Redirect/withRouter/
  useHistory/useRouteMatch/matchPath code to v6 APIs, or when a task mentions
  react-router, CompatRouter, CompatRoute, useNavigate, Routes, or the
  react-router-migration Linear project.
---

# React Router v5 → v6 Migration (Mattermost webapp)

## Strategy

We migrate incrementally with [`react-router-dom-v5-compat`](https://www.npmjs.com/package/react-router-dom-v5-compat), which runs v6 alongside v5 in the same tree under one v5 `history` object, so untouched code keeps working. The unit of work is **one `<Switch>`**: migrate the components rendered by that Switch's routes to v6 hooks, convert each `<Route>` to `<CompatRoute>`, then flip the Switch to `<Routes>`. Units are done **bottom-up**: a Switch converts only after every Switch rendered beneath it has converted (order in "Migration units"). Two cross-cutting layers stay on v5 until their own dedicated tickets: imperative navigation via `getHistory()` (~80 files) and the plugin contract (`window.ReactRouterDom`). The final cutover swaps to real v6 and deletes compat only once nothing imports v5 APIs. **Never do a big-bang upgrade**: a dependency-only bump to v6 was rejected upstream ([mattermost/mattermost#34902](https://github.com/mattermost/mattermost/pull/34902)).

## Hard rules

1. **Foundation first.** If `react-router-dom-v5-compat` is not in `webapp/channels/package.json`, the only ticket you may work is Foundation (reference.md, "Phase plan"). Stop and say so otherwise.
2. **One `<Switch>` per PR.** Convert all of its routes and flip it to `<Routes>` in the same PR. Never leave a Switch half-converted unless the ticket says so.
3. **Bottom-up only.** Never flip a Switch while any Switch it renders is still v5. Inside a converted `<Routes>`, child paths become relative, so top-down conversion breaks matching silently.
4. **No behavior changes.** The same URLs match, the same redirects fire, and query strings and `state` survive. If v6 forces a difference, call it out explicitly in the PR description.
5. **Never drop a regex path constraint silently.** v6 has no regex params. Each `:param(PATTERN)` must be replaced with an equivalent check (see "Regex constraints") that produces the same fallthrough result.
6. **Frozen until their own tickets:** `getHistory()` and `utils/browser_history.tsx` (desktop `push` shim + `module_registry` override), `history.block` in `utils/popouts/use_browser_popout.ts`, `window.ReactRouterDom` and `WebappUtils.browserHistory` in `plugins/export.ts`, the Module Federation shared-singleton list in `webapp/channels/webpack.config.js`, and `RouteComponentProps` in `types/store/plugins.ts`. Route tickets must not change them.
7. **Import v6 APIs from `react-router-dom-v5-compat`** until cutover, never from `react-router-dom`.
8. **Tests migrate in the same PR.** CI stays green, and type checks, lint, and tests pass for every touched file.

## Migration units (bottom-up order)

Each row is one ticket. Do not start a row until all rows it depends on have merged. Line numbers drift, so search for `<Switch>`.

| # | Switch (under `webapp/channels/src/components/`) | Depends on |
|---|---|---|
| 1 | `integrations/commands_container/commands_container.tsx` | — |
| 2 | `channel_layout/center_channel/center_channel.tsx` | — |
| 3 | `admin_console/admin_console.tsx` | — |
| 4 | `rhs_popout/rhs_popout.tsx` | — |
| 5 | `mfa/mfa_controller/mfa_controller.tsx` | — |
| 6 | `create_team/create_team.tsx` | — |
| 7 | `claim/claim_controller.tsx` | — |
| 8 | `backstage/backstage_controller.tsx` | 1 |
| 9 | `popout_controller/popout_controller.tsx` | 4 |
| 10 | `team_controller/team_controller.tsx` | 2, 8 |
| 11 | `root/root.tsx`: the `/admin_console` inner Switch | 3 |
| 12 | `root/root.tsx`: the `main-wrapper` Switch (products, plugins, `/:team`) | 10 |
| 13 | `root/root.tsx`: the top-level Switch, plus the `LoggedInRoute`/`HFRoute`/`HFTRoute` wrappers | 5, 6, 7, 9, 11, 12 |

If `rg '<Switch' webapp/channels/src` finds a Switch that isn't in this table, place it by nesting and add it to the table in your PR.

## Per-ticket checklist

```
- [ ] 1. Confirm preconditions: compat is installed (rule 1), and every dependency row has merged
- [ ] 2. Baseline: run scripts/survey.sh on the target directory and save the output
- [ ] 3. Map the unit: list every route in the Switch, the component each one renders,
        and whether it uses component=/render=/children, exact, regex params, or optional params
- [ ] 4. Find catch-alls: Switch children with no path (<Redirect>, <RootRedirect/>,
        wrapper components). Each one becomes <Route path="*" element={...}/>
- [ ] 5. Convert the components first (deepest first): useHistory → useNavigate,
        useRouteMatch → useMatch/useParams, withRouter/RouteComponentProps/ownProps.match →
        hooks or a small function wrapper (reference.md tables)
- [ ] 6. Convert each <Route> to <CompatRoute path=... element={...}/>
        (CompatRoute must stay inside the v5 <Switch>)
- [ ] 7. Replace regex constraints (see "Regex constraints")
- [ ] 8. Flip <Switch> to <Routes>: drop exact, make child paths relative,
        add /* to the parent route that renders this unit, and stop building paths from match.url
- [ ] 9. Check ranking: v6 picks the most specific route, not the first one listed.
        Confirm each URL from step 3 still reaches the same element
- [ ] 10. Update tests and mocks (see "Tests")
- [ ] 11. Run the verification commands; all must pass
- [ ] 12. Manual smoke test (see "Verification")
- [ ] 13. Re-run scripts/survey.sh and open the PR per .github/PULL_REQUEST_TEMPLATE.md,
         including which Switch was converted, the before/after survey output,
         and any behavior differences (rule 4)
```

## Regex constraints

v5 paths like ``/:team(${TEAM_NAME_PATH_PATTERN})`` and `:postid(${ID_PATH_PATTERN})` (patterns in `utils/path.ts`) decide whether a route matches. A non-matching URL falls through to the next route in the Switch. Replace them as follows:

- **Small fixed alternatives** such as `:path(channels|messages)`: create one route per literal (`channels/:identifier`, `messages/:identifier`).
- **Pattern constraints** such as team names or 26-character IDs: match the bare param, validate it in the element with the same regex from `utils/path.ts`, and on failure render exactly what the v5 Switch would have fallen through to (usually the catch-all).
- **Duplicated logic:** `doesRouteBelongToTeamControllerRoutes` in `root/root.tsx` keeps its own regex copy of the team routes. Keep it consistent with any route you change.

## Tests

- `src/tests/setup_jest.ts` loads `src/tests/react-router-dom_mock.ts` for every test. It replaces v5 `useHistory` and `getHistory()` with `global.historyMock`.
- When a component moves to `useNavigate`, its tests assert against a navigate mock, not `historyMock.push`. If the Foundation ticket hasn't added a shared `useNavigate` mock for `react-router-dom-v5-compat` to that file, add it there rather than per test.
- `renderWithContext` in `src/tests/react_testing_utils.tsx` wraps tests in a v5 `<Router history>` (pass `{history}` to control the URL). Use it instead of hand-rolled `<Router>` wrappers. v6 hooks only work in tests once Foundation adds `<CompatRouter>` there too.
- Ten test files call `jest.mock('react-router-dom', ...)` themselves. Update the ones covering your unit.

## Verification

From `webapp/` (install dependencies first with `make node_modules` if `node_modules` is missing):

```bash
npm run check-types --workspace=channels                    # tsc -b; must pass
npx eslint --quiet <changed files>                           # run from webapp/channels
npm run test --workspace=channels -- <changed dirs or tests>
```

From the repo root:

```bash
.cursor/skills/react-router-v6-migration/scripts/survey.sh webapp/channels/src/components/<unit dir>
```

Manual smoke test: run `make demo` from the repo root (it serves http://localhost:8065 and auto-logs-in as `lucas`). For every URL from checklist step 3:

- open it directly as a deep link;
- reach it by in-app navigation;
- use browser back and forward;
- try an invalid value for each regex-constrained param to confirm the fallthrough still matches v5.

## v6 gotchas in this codebase

- **Optional segments** (`/help/:page?`, `/:team/threads/:threadIdentifier?`): supported since v6.5. Check the installed compat version is at least 6.5 before relying on them.
- **Zero-or-more params** (`/_redirect/integrations/:subpath*` in `root.tsx`): not supported. Use a trailing `/*` and read the rest with `params['*']`.
- **`matchPath` arguments are reversed:** `matchPath(pathname, {path, exact})` becomes `matchPath({path, end}, pathname)`.
- **`useRouteMatch()` with no argument** (used to read `url` in drafts_link, recaps_link, global_threads_link, create_recap_modal, rhs_popout) has no v6 equivalent. Build the path from `useParams()` (for example, the team name).
- **`NavLink`:** `activeClassName` and `isActive=` become a `className={({isActive}) => ...}` callback. This includes the `BlockableLink` prop passthrough in `admin_console/blockable_link`.
- **Class components** connected through `withRouter` or `ownProps.match` need a small function wrapper that calls the hooks and passes explicit props. Do not rewrite the class unless the ticket asks.
- **Navigating during render**, such as `history.push('/mfa/setup')` in `team_controller`, must become `<Navigate replace/>` or a `useEffect`. Calling `navigate()` during render is not allowed.
- **Desktop app:** `getHistory().push` is replaced for the desktop app. Navigation from router hooks shares the same history object while compat is in place, so leave it alone.

## Additional resources

- Linear project: [Mattermost - React Router Migration](https://linear.app/lucas-marketing-agent/project/mattermost-react-router-migration-b22d2cc99262/overview). Ticket scope and order live here; if a ticket conflicts with "Migration units", follow the bottom-up rule and flag the conflict.
- Upstream playbook: [remix-run/react-router discussion #8753](https://github.com/remix-run/react-router/discussions/8753).
- [reference.md](reference.md): API conversion tables, codebase inventory, the plugin contract, the phase plan, and prior upstream attempts.
- [scripts/survey.sh](scripts/survey.sh): execute it to count v5 API usage per pattern; paste the before/after output into the PR.
