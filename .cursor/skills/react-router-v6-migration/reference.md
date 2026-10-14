# React Router v5 → v6 Migration Reference

Companion to [SKILL.md](SKILL.md): API conversion tables, codebase inventory, the plugin contract, the phase plan, and prior attempts.

## API conversion tables

Import v6 APIs from `react-router-dom-v5-compat` until the final cutover.

### Components

| v5 | v6 |
|---|---|
| `<Switch>` | `<Routes>`, only after every child is a `<CompatRoute>` and every Switch beneath it has converted |
| `<Route component={Foo}>` | `<CompatRoute element={<Foo/>}>` inside a v5 Switch; becomes `<Route element={<Foo/>}>` after the flip |
| `<Route render={(props) => ...}>` | `element={...}`; move wrapper logic into a component that uses hooks |
| `<Route path="/a">{children}</Route>` | `<Route path="/a" element={<>{children}</>}/>` |
| `<Route exact path="/a">` | `<Route path="/a">` (v6 always matches exactly); add `/*` if routes are rendered beneath it |
| Child with no `path` inside `<Switch>` (catch-all) | `<Route path="*" element={...}/>` |
| `<Redirect to="/x"/>` | `<Navigate to="/x" replace/>` (v5 Redirect replaces by default, so keep `replace`) |
| `<Redirect from="/a/:id" to="/b/:id"/>` | `<Route path="/a/:id" element={<RedirectWithParams/>}/>`. `Navigate` does not substitute params, so read them with `useParams` and build `to` |
| `<Link>` | Unchanged; inside a converted `<Routes>`, relative `to` resolves against the parent route |
| `<NavLink activeClassName="x" isActive={fn}>` | `<NavLink className={({isActive}) => ...}>`; move custom `isActive` logic into the callback using `useLocation`/`useMatch` |
| `<Prompt>` | None in the codebase. v6 blockers (`useBlocker`) require a data router |

### Hooks, HOCs, and utilities

| v5 | v6 |
|---|---|
| `useHistory().push(x)` | `useNavigate()(x)` |
| `useHistory().replace(x)` | `navigate(x, {replace: true})` |
| `useHistory().goBack()` | `navigate(-1)` |
| `useHistory().push({pathname, state})` | `navigate(pathname, {state})` |
| `useLocation()` | `useLocation()` (import swap only) |
| `useParams()` | `useParams()`; every value is typed `string \| undefined` |
| `useRouteMatch('/pattern')` | `useMatch('/pattern')`; it matches the whole path, so append `/*` for prefix matches |
| `useRouteMatch()` (no argument, reads `url`) | No equivalent. Rebuild the path from `useParams()` |
| `withRouter(Comp)` | Remove it; use hooks in the component, or wrap a class: `(props) => <Comp {...props} navigate={useNavigate()} params={useParams()}/>` |
| `ownProps.match.params.x` in `mapStateToProps` | Read `useParams()` in a wrapper and pass `x` as an explicit prop |
| `RouteComponentProps` | Remove it; type the explicit props |
| `matchPath(pathname, {path, exact, strict})` | `matchPath({path, end, caseSensitive}, pathname)`; the arguments are reversed and `exact` becomes `end` |
| `history.block(fn)` | No equivalent outside data routers. Owned by the imperative-navigation ticket |
| `history.listen(fn)` | Unchanged while compat runs on the v5 history; after cutover, use `useLocation` in an effect |

### Path syntax

| v5 path | v6 |
|---|---|
| `/:id(\\d+)` or ``/:team(${PATTERN})`` | `/:id` plus validation in the element (SKILL.md, "Regex constraints") |
| `/:path(channels\|messages)` | One route per literal |
| `/:page?` | `/:page?` works in v6.5 and later |
| `/:subpath*` | `/*`, read with `params['*']` |
| `` `${match.url}/child` `` | `"child"` (relative path) inside the converted `<Routes>` |

v5 `<Switch>` uses the first matching route; v6 `<Routes>` uses the most specific one. Check every URL after flipping.

## Codebase inventory

This is a snapshot. Re-run `scripts/survey.sh` before each ticket.

All usage is in `webapp/channels` (`react-router-dom@5.3.4`, `history@4.10.1`). About 190 files import from react-router.

### Router core

| What | Where |
|---|---|
| App router | `components/app.tsx`: `<Router history={getHistory()}>` (not `BrowserRouter`) |
| History singleton | `utils/browser_history.tsx`: `createBrowserHistory({basename: window.basename})` from history@4. For the desktop app, `push` is replaced so it calls `DesktopApp.doBrowserHistoryPush`. `getModule('utils/browser_history')` can override the whole object |
| Root route tree | `components/root/root.tsx`: 3 Switches. The top-level Switch includes `<WithUserTheme>` as a pathless catch-all wrapping the logged-in shell. The `main-wrapper` Switch renders product routes, `/plug/*` plugin routes, ``/:team(${TEAM_NAME_PATH_PATTERN})``, and `<RootRedirect/>` |
| Route wrappers (v5 `render` pattern) | `components/logged_in_route/index.tsx` (`LoggedInRoute`), `components/header_footer_template_route.tsx` (`HFTRoute`, `LoggedInHFTRoute`), `components/header_footer_route/header_footer_route.tsx` (`HFRoute`) |
| Test harness | `tests/react_testing_utils.tsx` (`renderWithContext` wraps tests in a v5 `<Router>`), `tests/react-router-dom_mock.ts` (loaded by `tests/setup_jest.ts`; mocks `useHistory` and `getHistory`) |

### Switches (13 in 11 files)

Migration order is in SKILL.md, "Migration units". Notes per Switch:

- `team_controller`: regex `/:team(...)` routes for integrations, emoji, and plugins; pathless `<ChannelController>` catch-all; `history.push('/mfa/setup')` during render.
- `center_channel`: absolute ``/:team(...)/...`` paths; `${match.url}/pl/:postid(...)`; optional `:postid?` and `:threadIdentifier?`; fallback `<Redirect to={lastChannelPath}/>`.
- `backstage_controller`: about 20 `component=` routes.
- `commands_container`: `render` redirect to `${match.url}/installed`.
- `admin_console`: routes generated from `admin_definition`; 2 `<Redirect>`s, one built from `match.url`.
- `popout_controller`: regex and optional params; calls `useBrowserPopout()`, which uses `history.block`.
- `rhs_popout`: uses `useRouteMatch()` with no argument.
- `mfa_controller`, `create_team` (redirect to `${match.url}/display_name`), `claim_controller`: small step-by-step Switches.

### v5 API usage (files, from `scripts/survey.sh`)

| Pattern | Files | Notes |
|---|---|---|
| `getHistory()` | 81 | Redux thunks, utils, and stores outside React. Frozen (SKILL.md rule 6) |
| `<Link>` / `NavLink` | 62 / 5 | `NavLink` uses `activeClassName` (admin sidebar, backstage, `BlockableLink`) and `isActive=` (drafts_link) |
| `useHistory` | 34 | |
| `match.url/path/params` | 28 | Child paths are built from `match.url` |
| `RouteComponentProps` | 27 | Includes the plugin typing in `types/store/plugins.ts` (frozen) |
| `useLocation` | 21 | Import swap only |
| `withRouter` | 12 | All in connected `index.ts` files: root, post_view, channel_view, center_channel, channel_identifier_router, backstage, sidebar_right, team_sidebar, mobile_channel_header, toast_wrapper, delete_post_modal, unreads_status_handler |
| `ownProps.match` | 10 | Route params read in `mapStateToProps` |
| `jest.mock('react-router...')` | 10 | Per-test mocks to update alongside their components |
| `matchPath` | 8 | v5 argument order; `utils/products.ts` passes `{exact: false, strict: false}` |
| `<Redirect>` | 8 | Includes `from=` with params in `root.tsx` |
| `useRouteMatch` | 6 | 5 of them use the no-argument form |
| `history.block` | 1 | `utils/popouts/use_browser_popout.ts`: in popout windows, it blocks every navigation outside `/_popout` and forwards it to `window.opener` |
| regex path params | 5 | `root`, `team_controller`, `center_channel`, `popout_controller`, `channel_popout.test` |

## Plugin and Module Federation contract (frozen until cutover)

- `plugins/export.ts` sets `window.ReactRouterDom = require('react-router-dom')`, the whole v5 module, and exposes `window.WebappUtils.browserHistory` as `getHistory()`.
- `webapp/platform/shared/build/webpack-web-app-externals.cjs` maps plugin imports of `react-router-dom` to `window.ReactRouterDom`.
- `webapp/channels/webpack.config.js` shares `react-router-dom` and `history` as forced singletons with Module Federation containers (products and the desktop app).
- `plugins/registry.ts`: `registerCustomRoute`, `registerNeedsTeamRoute`, and `registerProduct` are rendered as v5 `render` routes in `root.tsx` and `team_controller.tsx`. `types/store/plugins.ts` types `publicComponent` with `RouteComponentProps`.

Switching any of these to v6 breaks external plugins and products, so it needs versioning and communication to plugin authors. It belongs to the cutover ticket only.

## Phase plan (maps to Linear tickets)

1. **Foundation.** Add `react-router-dom-v5-compat` (v6.5 or later). Wrap `<CompatRouter>` inside `<Router>` in `components/app.tsx` and in `Providers` in `tests/react_testing_utils.tsx`. Add a shared `useNavigate` mock to `tests/react-router-dom_mock.ts`. No behavior change.
2. **Switches with nothing beneath them:** commands_container, center_channel, admin_console, rhs_popout, mfa_controller, create_team, claim_controller.
3. **Switches whose dependencies are done:** backstage, popout_controller, then team_controller.
4. **Root tree:** the 3 `root.tsx` Switches, the route wrappers, plugin and product route rendering (still on compat; plugin contract unchanged).
5. **Imperative navigation:** pick a strategy for the ~80 `getHistory()` call sites (for example `unstable_HistoryRouter` with history@5, or a router-owned `navigate` reference). It must keep the desktop `push` shim and the `module_registry` override working, and replace the popout `history.block`.
6. **Final cutover:** switch the dependency to `react-router-dom@6`, delete compat, migrate the plugin contract (with deprecation communication), and remove `history@4`.

## Prior attempts

| Attempt | Result | Lesson |
|---|---|---|
| [mattermost-webapp#11562](https://github.com/mattermost/mattermost-webapp/pull/11562) (2022, 5.3.3 → 5.3.4) | Maintainers assessed v6 as a whole-app change requiring work on class components; no follow-up | The scope has been known for years. Plan for class-component wrappers |
| [mattermost/mattermost#30912](https://github.com/mattermost/mattermost/pull/30912) (2025, `<CompatRouter>` in `app.tsx`) | Open and stale; never reviewed. Lock file is outdated | Re-create the Foundation PR rather than rebasing, and line up a reviewer first |
| [mattermost/mattermost#34902](https://github.com/mattermost/mattermost/pull/34902) (2026, Snyk bump to 6.30.2) | Closed: "We cannot upgrade to major version of react-router will just lock file change." | No big-bang upgrades. Snyk flagged `SNYK-JS-REACTROUTER-14908286` (open redirect) on 5.3.4; whether it is exploitable here is unverified |
