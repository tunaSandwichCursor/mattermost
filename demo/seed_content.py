#!/usr/bin/env python3
"""Curated demo content for the local Mattermost instance.

Called by demo/seed.sh after `mmctl sampledata` has generated bulk volume.
This script uses the REST API (stdlib only, no dependencies) to build a
realistic, demo-ready workspace on top of that:

- A curated "Demo HQ" team with named channels and believable conversations
  (threads, mentions, markdown, code blocks, reactions, pinned posts).
- lucas joined to every team and every public channel so the whole workspace
  looks lived-in from his perspective.
- Everything marked read for lucas, then a few fresh messages and DMs sent so
  he logs into a small, believable unread state instead of a wall of unreads.
"""

import json
import sys
import urllib.error
import urllib.request

BASE_URL = "http://localhost:8065/api/v4"

LUCAS = {"username": "lucas", "password": "Password123!"}

# Named cast for the curated team. Created by this script with a known
# password so the demo can switch between believable users.
CAST_PASSWORD = "Demo123!"
CAST = [
    ("maya.chen", "Maya", "Chen", "Product Manager"),
    ("dev.patel", "Dev", "Patel", "Staff Engineer"),
    ("sofia.reyes", "Sofia", "Reyes", "Data Analyst"),
    ("jordan.brooks", "Jordan", "Brooks", "Backend Engineer"),
    ("sam.okafor", "Sam", "Okafor", "SRE"),
    ("elena.novak", "Elena", "Novak", "Frontend Engineer"),
    ("kai.tanaka", "Kai", "Tanaka", "Product Designer"),
    ("ryan.mills", "Ryan", "Mills", "Marketing Lead"),
]


class Client:
    def __init__(self, token=None):
        self.token = token

    def request(self, method, path, body=None, ignore_errors=False):
        req = urllib.request.Request(f"{BASE_URL}{path}", method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        data = json.dumps(body).encode() if body is not None else None
        try:
            with urllib.request.urlopen(req, data=data) as resp:
                payload = resp.read()
                headers = dict(resp.headers)
                return json.loads(payload) if payload else None, headers
        except urllib.error.HTTPError as e:
            if ignore_errors:
                return None, {}
            detail = e.read().decode(errors="replace")
            raise RuntimeError(f"{method} {path} failed ({e.code}): {detail}") from e

    def get(self, path):
        return self.request("GET", path)[0]

    def post(self, path, body=None, ignore_errors=False):
        return self.request("POST", path, body, ignore_errors)[0]

    def put(self, path, body=None, ignore_errors=False):
        return self.request("PUT", path, body, ignore_errors)[0]


def login(username, password):
    client = Client()
    user, headers = client.request(
        "POST", "/users/login", {"login_id": username, "password": password}
    )
    client.token = headers.get("Token")
    client.user = user
    return client


def main():
    admin = login(LUCAS["username"], LUCAS["password"])
    lucas_id = admin.user["id"]

    # Create the named cast for the curated team, then log each one in.
    print("  creating demo cast users...")
    sessions = {"lucas": admin}
    user_ids = {"lucas": lucas_id}
    for username, first, last, position in CAST:
        admin.post(
            "/users",
            {
                "username": username,
                "email": f"{username.replace('.', '_')}@example.com",
                "password": CAST_PASSWORD,
                "first_name": first,
                "last_name": last,
                "position": position,
            },
            ignore_errors=True,  # already exists on reruns
        )
        client = login(username, CAST_PASSWORD)
        sessions[username] = client
        user_ids[username] = client.user["id"]

    cast = [username for username, *_ in CAST]

    # ------------------------------------------------------------------
    # Curated team + channels
    # ------------------------------------------------------------------
    print("  creating Demo HQ team...")
    team = admin.post(
        "/teams",
        {"name": "demo-hq", "display_name": "Demo HQ", "type": "O", "allow_open_invite": True},
        ignore_errors=True,
    )
    if team is None:  # already exists
        team = admin.get("/teams/name/demo-hq")
    team_id = team["id"]

    for name in ["lucas", *cast]:
        admin.post(f"/teams/{team_id}/members", {"team_id": team_id, "user_id": user_ids[name]}, ignore_errors=True)

    channel_specs = [
        ("product", "Product", "Roadmap, specs, and product decisions"),
        ("engineering", "Engineering", "Build, ship, repeat"),
        ("design", "Design", "Mocks, critique, and design systems"),
        ("launch-atlas", "Launch: Atlas", "War room for the Atlas launch"),
        ("incidents", "Incidents", "Production incidents and postmortems"),
        ("watercooler", "Watercooler", "Everything off-topic"),
    ]
    channels = {}
    for name, display, purpose in channel_specs:
        ch = admin.post(
            "/channels",
            {"team_id": team_id, "name": name, "display_name": display, "type": "O", "purpose": purpose},
            ignore_errors=True,
        )
        if ch is None:
            ch = admin.get(f"/teams/{team_id}/channels/name/{name}")
        channels[name] = ch["id"]
        for member in ["lucas", *cast]:
            admin.post(f"/channels/{ch['id']}/members", {"user_id": user_ids[member]}, ignore_errors=True)

    def say(who, channel, message, root=None):
        body = {"channel_id": channels[channel], "message": message}
        if root:
            body["root_id"] = root
        return sessions[who].post("/posts", body)

    def react(who, post, emoji):
        sessions[who].post(
            "/reactions",
            {"user_id": user_ids[who], "post_id": post["id"], "emoji_name": emoji, "create_at": 0},
            ignore_errors=True,
        )

    # ------------------------------------------------------------------
    # Conversations
    # ------------------------------------------------------------------
    print("  writing curated conversations...")
    u = cast + cast  # simple cycling helper so indexing never runs out

    # product
    p = say("lucas", "product", "Team — kicking off planning for **Project Atlas** (the Q3 self-serve onboarding revamp). Draft PRD is here, please leave comments by Thursday: https://example.com/atlas-prd")
    react(u[0], p, "rocket")
    react(u[1], p, "eyes")
    r = say(u[0], "product", "Read through it. Biggest open question for me: are we gating the new flow behind a feature flag or shipping to 100%?", p["id"])
    say("lucas", "product", "Feature flag, ramping 10% → 50% → 100% over two weeks. Adding a rollout section to the PRD now.", p["id"])
    say(u[1], "product", "One more thing to consider — support tickets spike every time we touch onboarding. Can we brief the support team a week before ramp?", p["id"])
    p2 = say(u[2], "product", "Metrics update: activation rate held at **41.3%** last week, up 2.1pts since the empty-state changes shipped. Weekly report in the dashboard.")
    react("lucas", p2, "chart_with_upwards_trend")
    react(u[3], p2, "tada")

    # engineering
    e = say(u[3], "engineering", "Heads up: bumping the Postgres driver to v5 in tomorrow's deploy. Migrations are backwards-compatible but shout if you have long-running branches touching the store layer.")
    react(u[4], e, "+1")
    say(u[4], "engineering", "I do in `feature/audit-log` — will rebase today.", e["id"])
    e2 = say("lucas", "engineering", "Code review culture reminder: PRs under 400 lines get reviewed same-day, monsters get reviewed... eventually. Split your work, your reviewers thank you. :pray:")
    react(u[0], e2, "joy")
    react(u[5], e2, "100")
    e3 = say(u[5], "engineering", "Anyone else seeing flaky `TestWebSocketReconnect` on CI? Third time this week.\n\n```\n--- FAIL: TestWebSocketReconnect (12.03s)\n    websocket_test.go:184: timed out waiting for reconnect event\n```")
    say(u[3], "engineering", "Yeah, it's a known race — there's a fix up for review. Retry for now.", e3["id"])
    say(u[5], "engineering", "Linked the PR to the flaky-test tracking issue. :white_check_mark:", e3["id"])
    admin.post(f"/posts/{e['id']}/pin", ignore_errors=True)

    # design
    d = say(u[6], "design", "New mocks for the Atlas welcome screen are up in Figma. Went with the progressive-disclosure approach we discussed — three steps instead of the seven-field wall. Feedback welcome!")
    react("lucas", d, "heart")
    react(u[2], d, "fire")
    say("lucas", "design", "Huge improvement. One nit: can the team-name step suggest a default from the user's email domain?", d["id"])
    say(u[6], "design", "Good call — added a variant with the suggestion pre-filled.", d["id"])

    # launch-atlas
    say("lucas", "launch-atlas", "Welcome to the Atlas war room. Launch target is the 24th. Daily async standups here at 10am — format: *yesterday / today / blockers*.")
    say(u[0], "launch-atlas", "**Standup**\n- Yesterday: finished flag plumbing for the new flow\n- Today: ramp dashboard\n- Blockers: none")
    say(u[6], "launch-atlas", "**Standup**\n- Yesterday: final welcome-screen assets to eng\n- Today: empty states for invite step\n- Blockers: waiting on copy review from @lucas")
    l = say(u[2], "launch-atlas", "Draft launch announcement is ready for review. Targeting the changelog, the blog, and an in-app notice for admins.")
    react(u[1], l, "eyes")
    admin.post(f"/posts/{l['id']}/pin", ignore_errors=True)

    # incidents
    i = say(u[4], "incidents", ":rotating_light: **INC-142** — elevated 5xx on the file upload service, started 14:32 UTC. Error rate ~4%. Investigating.")
    react("lucas", i, "eyes")
    say(u[4], "incidents", "Root cause: S3 client connection pool exhaustion after the retry change in #4821. Rolling back.", i["id"])
    say(u[4], "incidents", "Rollback deployed, error rate back to baseline. Duration: 23 minutes. Postmortem doc tomorrow.", i["id"])
    ir = say("lucas", "incidents", "Nice fast turnaround on INC-142. Reminder that blameless postmortems are due within 48h — template is pinned.", i["id"])
    react(u[4], ir, "+1")

    # watercooler
    w = say(u[1], "watercooler", "Hot take: the office coffee machine's 'strong' setting is a lie.")
    react(u[5], w, "joy")
    react(u[3], w, "coffee")
    say(u[7], "watercooler", "Petition to expense a proper espresso machine. I'll write the six-pager.", w["id"])
    say("lucas", "watercooler", "If it comes with a doc titled 'Espresso: a strategic investment', I'll approve it.", w["id"])

    # ------------------------------------------------------------------
    # Join lucas to every other team and public channel
    # ------------------------------------------------------------------
    print("  joining lucas to all teams and public channels...")
    all_teams = admin.get("/teams?page=0&per_page=200") or []
    for t in all_teams:
        admin.post(f"/teams/{t['id']}/members", {"team_id": t["id"], "user_id": lucas_id}, ignore_errors=True)
        chans = admin.get(f"/teams/{t['id']}/channels?page=0&per_page=200") or []
        for ch in chans:
            if ch["type"] == "O":
                admin.post(f"/channels/{ch['id']}/members", {"user_id": lucas_id}, ignore_errors=True)

    # ------------------------------------------------------------------
    # Custom statuses for a few teammates
    # ------------------------------------------------------------------
    for name, emoji, text in [
        (cast[0], "spiral_calendar_pad", "In meetings until 3"),
        (cast[3], "palm_tree", "OOO — back Monday"),
        (cast[5], "technologist", "Deep work, slow to respond"),
    ]:
        sessions[name].put(
            f"/users/{user_ids[name]}/status/custom",
            {"emoji": emoji, "text": text},
            ignore_errors=True,
        )

    # ------------------------------------------------------------------
    # Mark everything read for lucas, then create a small unread state
    # ------------------------------------------------------------------
    print("  marking channels read for lucas...")
    for t in all_teams:
        chans = admin.get(f"/users/{lucas_id}/teams/{t['id']}/channels") or []
        for ch in chans:
            admin.post(
                f"/channels/members/{lucas_id}/view",
                {"channel_id": ch["id"]},
                ignore_errors=True,
            )

    print("  leaving fresh unread messages and DMs...")
    say(u[0], "launch-atlas", "@lucas ramp dashboard is live — flag is at 10% as of this morning. Numbers look healthy so far. :chart_with_upwards_trend:")
    say(u[2], "product", "Atlas PRD comments are resolved; final version is ready for your sign-off @lucas.")

    for name, messages in [
        (cast[6], [
            "Hey Lucas — copy review for the Atlas welcome screens is in your queue when you have 15 min today.",
            "No rush before noon, just want it before the ramp goes to 50%.",
        ]),
        (cast[4], [
            "Postmortem draft for INC-142 is done. Want to co-review before I share it in #incidents?",
        ]),
    ]:
        dm = sessions[name].post("/channels/direct", [user_ids[name], lucas_id])
        for msg in messages:
            sessions[name].post("/posts", {"channel_id": dm["id"], "message": msg})

    print("  curated content done.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # surface a clean error for the shell script
        print(f"seed_content.py failed: {exc}", file=sys.stderr)
        sys.exit(1)
