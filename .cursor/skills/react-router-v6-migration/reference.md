# React Router v5 → v6 Migration Reference

Companion to [SKILL.md](SKILL.md). API conversion tables, codebase inventory, and the phase plan.

## API conversion tables

### Components

| v5 | v6 (via `react-router-dom-v5-compat` until cutover) |
|---|---|
| `<Switch>` | `<Routes>` (only after every child is a `<CompatRoute>`) |
| `<Route component={Foo}>` | `<Route element={<Foo/>}>` |
| `<Route render={(props) => ...}>` | `<Route element={...}>` — hoist wrapper logic into a layout/wrapper component that uses hooks |
| `<Route exact path="/a">` | `<Route path="/a">` (exact is default); add `/*` if it has descendant routes |
| `<Redirect to="/x"/>` | `<Navigate to="/x" replace/>` (v5 Redirect replaces by default — keep `replace`) |
| `<Redirect from="/a" to="/b"/>` | `<Route path="/a" element={<Navigate to="/b" replace/>}/>` |
| `<Link>` / `<NavLink>` | Same names; `NavLink` `activeClassName`/`activeStyle` → `className={({isActive}) => ...}` callback |
| `<Prompt>` | No v6 equivalent (use `usePrompt`/`useBlocker` from the compat/v6.4+ data router) — none in this codebase today |

### Hooks and HOCs

| v5 | v6 |
|---|---|
| `useHistory().push(x)` | `useNavigate()(x)` |
| `useHistory().replace(x)` | `navigate(x, {replace: true})` |
| `useHistory().goBack()` | `navigate(-1)` |
| `useLocation()` | `useLocation()` (unchanged; import from compat) |
| `useParams()` | `useParams()` (unchanged; all values typed `string \| undefined`) |
| `useRouteMatch()` | `useMatch()` — requires an explicit pattern; no argument-less form. For "current match" info use `useLocation` + `matchPath` |
| `withRouter(Comp)` | Delete the HOC; use hooks inside, or wrap: `const WithRouter = (props) => { const navigate = useNavigate(); ... return <Comp {...props} navigate={navigate}/>; }` |
| `RouteComponentProps` type | Remove; type explicit props or use hooks |
| `matchPath(pathname, {path, exact, strict})` | `matchPath({path, end, caseSensitive}, pathname)` — **argument order flipped**, `exact` → `end` |
| `history.listen((location) => ...)` | v5-compat: unchanged while the v5 history object drives the router. Post-cutover: `useLocation` in an effect, or the history@5 signature `({location, action}) => ...` |

### Path semantics

- No regex (`path="/:id(\\d+)"`) and no optional segments (`path="/:id?"`). Duplicate the route per variant.
- Splats: `path="/files/*"`, read via `params['*']`.
- Inside a converted `<Routes>`, descendant `<Route path>` and `<Link to>` are **relative** to the parent route.

## Codebase inventory (snapshot — re-survey before each ticket)

All react-router usage lives in `webapp/channels` (`react-router-dom@5.3.4`, `history@4.10.1`). ~195 files import from react-router.

### Router core

| What | Where |
|---|---|
| App router | `webapp/channels/src/components/app.tsx` — `<Router history={getHistory()}>` |
| History singleton | `webapp/channels/src/utils/browser_history.tsx` — history@4 `createBrowserHistory({basename})` + desktop-app `push` shim + `module_registry` override; exported via `getHistory()` |
| Root route tree | `webapp/channels/src/components/root/root.tsx` — top-level `<Switch>` (~20 `component=` routes, 2 `<Redirect>`), nested Switches for `/admin_console` and logged-in products/plugins |
| Test harness | `webapp/channels/src/tests/react_testing_utils.tsx`, `webapp/channels/src/tests/react-router-dom_mock.ts` |

### Route controllers (each owns a `<Switch>` — migration units)

- `components/backstage/backstage_controller.tsx` — ~20 `component=` routes, 8 `exact`
- `components/admin_console/admin_console.tsx`
- `components/team_controller/team_controller.tsx`
- `components/channel_layout/center_channel/center_channel.tsx`
- `components/popout_controller/popout_controller.tsx`

### Route wrappers (v5 `render`-prop pattern; convert to layout/wrapper components)

- `components/logged_in_route/index.tsx` (`LoggedInRoute`)
- `components/header_footer_template_route.tsx` (`HFTRoute`, `LoggedInHFTRoute`)
- `components/header_footer_route/header_footer_route.tsx` (`HFRoute`)

### v5 API usage counts (approx., files)

| Pattern | Files | Notes |
|---|---|---|
| `getHistory()` | ~98 | Redux thunks (`actions/global_actions.tsx`, `channel_actions.ts`, `websocket_actions.ts`, …), utils, stores |
| `useHistory` | ~40 | |
| `RouteComponentProps` | ~26 | |
| `useLocation` | ~25 | Usually fine as-is (import swap) |
| `ownProps.match.*` in connect | ~28 | e.g. `center_channel/index.ts` builds paths from `match.url` |
| `withRouter` | 13 | All in connected `index.ts` wrappers; list: root, post_view, channel_view, center_channel, channel_identifier_router, backstage, sidebar_right, team_sidebar, mobile_channel_header, toast_wrapper, delete_post_modal, unreads_status_handler, team_controller |
| `<Switch>` | 11 | |
| `matchPath` | 10 | `utils/products.ts` uses `{exact, strict}` options |
| `useRouteMatch` | 9 | |
| `<Redirect>` | ~9 | |
| `Link` / `NavLink` | ~68 / 5 | |

### Plugin contract (frozen until final cutover)

- `webapp/channels/src/plugins/export.ts` — exposes `window.ReactRouterDom` (whole v5 module) and `window.WebappUtils.browserHistory` (`getHistory()`)
- `webapp/platform/shared/build/webpack-web-app-externals.cjs` — maps `react-router-dom` → `window.ReactRouterDom` for plugin builds
- `plugins/registry.ts` — `registerCustomRoute`, `registerNeedsTeamRoute`, `registerProduct` render as v5 routes in `root.tsx`
- `types/store/plugins.ts` — plugin typings use `RouteComponentProps`

## Phase plan (maps to Linear tickets)

1. **Foundation** — add `react-router-dom-v5-compat`, wrap `<CompatRouter>` in `app.tsx` (rebase/land PR #30912), extend test harness so both APIs render in tests. Zero behavior change.
2. **Leaf trees: backstage + admin console** — convert those Switches bottom-up to `<Routes>`.
3. **Logged-in core: team/channel routing** — team_controller, center_channel, channel_identifier_router; kill `match`-prop plumbing in connected index files.
4. **Root tree + wrappers** — `root.tsx` Switches, `LoggedInRoute`/`HFTRoute`/`HFRoute`, Redirects, plugin/product route rendering (still on compat, plugin contract untouched).
5. **Imperative navigation layer** — strategy + execution for the ~98 `getHistory()` call sites (keep a router-owned navigate ref or `unstable_HistoryRouter`); update `STYLE_GUIDE.md` convention.
6. **Final cutover** — swap dependency to `react-router-dom@6`, delete compat, resolve the plugin contract (`window.ReactRouterDom` v6 + deprecation comms), remove `history@4`.
