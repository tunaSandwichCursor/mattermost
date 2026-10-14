#!/usr/bin/env bash
# Counts files using each react-router v5 pattern under a directory.
# Usage (from repo root): .cursor/skills/react-router-v6-migration/scripts/survey.sh [dir]
# Default dir: webapp/channels/src. Paste the output into the PR description before/after.
set -euo pipefail

dir="${1:-webapp/channels/src}"
if [[ ! -d "$dir" ]]; then
    echo "error: directory not found: $dir (run from the repo root)" >&2
    exit 1
fi
if ! command -v rg >/dev/null 2>&1; then
    echo "error: ripgrep (rg) is required" >&2
    exit 1
fi

patterns=(
    'imports react-router|from .react-router(-dom)?.'
    '<Switch>|<Switch\b'
    '<Redirect>|<Redirect\b'
    'withRouter|\bwithRouter\('
    'useHistory|\buseHistory\('
    'useRouteMatch|\buseRouteMatch\('
    'matchPath|\bmatchPath\('
    'RouteComponentProps|\bRouteComponentProps\b'
    'match.url/path/params|\bmatch\.(url|path|params)\b'
    'ownProps.match|ownProps\.match'
    'getHistory()|\bgetHistory\('
    'history.block|\bhistory\.block\('
    'regex path param|path=.*:[A-Za-z]+\('
    'NavLink activeClassName|activeClassName='
    'jest.mock(react-router)|jest\.mock\(.react-router'
)

printf '%-26s %s\n' 'pattern' 'files'
for entry in "${patterns[@]}"; do
    label="${entry%%|*}"
    regex="${entry#*|}"
    count=$({ rg -l -e "$regex" -g '*.{ts,tsx,js,jsx}' "$dir" 2>/dev/null || true; } | wc -l | tr -d ' ')
    printf '%-26s %s\n' "$label" "$count"
done
