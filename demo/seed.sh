#!/bin/bash
# Seeds the local Mattermost instance with demo data.
#
# Idempotent: if the primary demo user "lucas" already exists, seeding is
# skipped entirely. Use `make demo-reset` from the repo root to wipe the
# database and reseed from scratch.
#
# Requires the server to be running (started via `make demo` or
# `cd server && make run-server`) with local mode enabled, which is automatic
# for dev builds.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"
MMCTL="$SERVER_DIR/bin/mmctl"

DEMO_USER="lucas"
DEMO_PASSWORD="Password123!"
DEMO_EMAIL="lucas@example.com"

cd "$SERVER_DIR"

if [ ! -x "$MMCTL" ]; then
    echo "mmctl not found at $MMCTL — building it..."
    make mmctl-build
fi

echo "Waiting for the Mattermost server to come up..."
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-120}" ./scripts/wait-for-system-start.sh

if "$MMCTL" --local user search "$DEMO_USER" >/dev/null 2>&1; then
    echo "Demo data already seeded (user '$DEMO_USER' exists) — skipping."
    echo "Run 'make demo-reset' from the repo root to wipe and reseed."
    exit 0
fi

echo "==> Applying demo-friendly server config..."
"$MMCTL" --local config set TeamSettings.MaxUsersPerTeam 200
"$MMCTL" --local config set ServiceSettings.EnableOnboardingFlow false
"$MMCTL" --local config set TeamSettings.EnableOpenServer true

echo "==> Creating primary demo user '$DEMO_USER' (system admin)..."
"$MMCTL" --local user create \
    --username "$DEMO_USER" \
    --email "$DEMO_EMAIL" \
    --password "$DEMO_PASSWORD" \
    --firstname Lucas \
    --lastname Garza \
    --system-admin \
    --email-verified

echo "==> Generating bulk sample data (teams, users, channels, post history)..."
echo "    This runs as a server-side import job and can take a minute."
"$MMCTL" --local sampledata \
    --seed 42 \
    --teams 3 \
    --channels-per-team 8 \
    --users 40 \
    --guests 2 \
    --deactivated-users 2 \
    --team-memberships 3 \
    --channel-memberships 6 \
    --posts-per-channel 80 \
    --direct-channels 25 \
    --posts-per-direct-channel 12 \
    --group-channels 8 \
    --posts-per-group-channel 20

echo "==> Creating curated demo team, conversations, threads, and DMs..."
python3 "$REPO_ROOT/demo/seed_content.py"

echo ""
echo "============================================================"
echo " Demo data seeded successfully."
echo ""
echo "   URL:            http://localhost:8065"
echo "   Primary user:   $DEMO_USER / $DEMO_PASSWORD  (auto-logged-in)"
echo "   Demo cast:      maya.chen, dev.patel, ... / Demo123!"
echo "   Sample users:   user-1 / SampleUs@r-1, sysadmin / Sys@dmin-sample1"
echo "============================================================"
