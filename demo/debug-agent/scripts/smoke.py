#!/usr/bin/env python3
"""Phase 2 smoke test for the @debug bridge (dry-run mode).

Requires:
  - Mattermost demo server running and seeded
  - Bot provisioned (demo/debug-agent/.env.local)
  - Bridge running with DEBUG_AGENT_DRY_RUN=1

Usage:
  python3 demo/debug-agent/scripts/smoke.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "http://localhost:8065/api/v4"
CAST_USER = {"username": "maya.chen", "password": "Demo123!"}
ENV_LOCAL = Path(__file__).resolve().parents[1] / ".env.local"


class Client:
    def __init__(self, token: str | None = None):
        self.token = token
        self.user = None

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
                return (json.loads(payload) if payload else None), headers
        except urllib.error.HTTPError as e:
            if ignore_errors:
                return None, {}
            detail = e.read().decode(errors="replace")
            raise RuntimeError(f"{method} {path} failed ({e.code}): {detail}") from e

    def get(self, path, ignore_errors=False):
        return self.request("GET", path, ignore_errors=ignore_errors)[0]

    def post(self, path, body=None, ignore_errors=False):
        return self.request("POST", path, body, ignore_errors=ignore_errors)[0]


def login(username, password) -> Client:
    c = Client()
    user, headers = c.request("POST", "/users/login", {"login_id": username, "password": password})
    c.token = headers.get("Token")
    c.user = user
    return c


def read_bot_id() -> str:
    if not ENV_LOCAL.exists():
        raise RuntimeError(f"missing {ENV_LOCAL}; run provision.py first")
    values = {}
    for line in ENV_LOCAL.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, _, v = line.partition("=")
            values[k.strip()] = v.strip()
    bot_id = values.get("MATTERMOST_BOT_USER_ID")
    if not bot_id:
        # Fall back to username lookup via maya session later.
        return ""
    return bot_id


def wait_thread_posts(client: Client, root_id: str, bot_id: str, min_bot_posts: int, timeout: float, require_substr: str | None = None):
    deadline = time.time() + timeout
    last = []
    while time.time() < deadline:
        thread = client.get(f"/posts/{root_id}/thread")
        posts = list((thread or {}).get("posts", {}).values())
        bot_posts = sorted(
            [p for p in posts if p.get("user_id") == bot_id],
            key=lambda p: p.get("create_at", 0),
        )
        last = bot_posts
        if len(bot_posts) >= min_bot_posts:
            if require_substr is None or any(require_substr.lower() in p.get("message", "").lower() for p in bot_posts):
                return bot_posts
        time.sleep(0.5)
    return last


def assert_true(cond: bool, msg: str):
    if not cond:
        raise AssertionError(msg)


def main() -> int:
    print("==> smoke: logging in as maya.chen")
    maya = login(CAST_USER["username"], CAST_USER["password"])
    admin = login("lucas", "Password123!")

    bot_user = admin.get("/users/username/debug")
    assert_true(bot_user is not None, "bot @debug not found — run provision.py")
    bot_id = bot_user["id"]

    team = admin.get("/teams/name/demo-hq")
    assert_true(team is not None, "demo-hq team missing — reseed with make demo")
    channel = admin.get(f"/teams/{team['id']}/channels/name/engineering")
    assert_true(channel is not None, "engineering channel missing")
    channel_id = channel["id"]

    failures = []

    # --- Trigger + threading ---
    print("==> smoke: @debug mention trigger + threading order")
    mention = maya.post(
        "/posts",
        {"channel_id": channel_id, "message": "@debug what does make demo do?"},
    )
    root_id = mention["id"]
    bot_posts = wait_thread_posts(
        maya, root_id, bot_id, min_bot_posts=3, timeout=45, require_substr="dry-run"
    )
    try:
        assert_true(len(bot_posts) >= 3, f"expected >=3 bot posts, got {len(bot_posts)}")
        for p in bot_posts:
            assert_true(p.get("root_id") == root_id, f"post {p['id']} missing root_id={root_id}")
        texts = [p["message"] for p in bot_posts]
        assert_true(
            any("view this run" in t.lower() or "cursor.com/agents" in t.lower() for t in texts),
            f"missing view-run link: {texts}",
        )
        assert_true(
            any("reading" in t.lower() or "searching" in t.lower() for t in texts),
            f"missing real progress milestone: {texts}",
        )
        assert_true(
            "dry-run" in bot_posts[-1]["message"].lower() or "makefile" in bot_posts[-1]["message"].lower(),
            f"final answer not last: {bot_posts[-1]['message']}",
        )
        print("  PASS trigger+threading")
    except AssertionError as e:
        failures.append(str(e))
        print(f"  FAIL trigger+threading: {e}")
        bot_posts = bot_posts or []

    # --- @channel false-positive guard ---
    print("==> smoke: @channel must NOT trigger the bot")
    before = len(
        [
            p
            for p in (maya.get(f"/posts/{root_id}/thread") or {}).get("posts", {}).values()
            if p.get("user_id") == bot_id
        ]
    )
    # Post @channel in the channel (new root), wait, ensure no bot replies on that post.
    channel_post = maya.post(
        "/posts",
        {"channel_id": channel_id, "message": "@channel quick heads up — ignore this"},
    )
    time.sleep(10)
    channel_thread = maya.get(f"/posts/{channel_post['id']}/thread")
    bot_on_channel = [
        p for p in (channel_thread or {}).get("posts", {}).values() if p.get("user_id") == bot_id
    ]
    try:
        assert_true(len(bot_on_channel) == 0, f"@channel incorrectly triggered bot: {bot_on_channel}")
        print("  PASS @channel guard")
    except AssertionError as e:
        failures.append(str(e))
        print(f"  FAIL @channel guard: {e}")

    # --- Non-mention silence ---
    print("==> smoke: plain message must NOT trigger")
    plain = maya.post("/posts", {"channel_id": channel_id, "message": "just chatting, no bot please"})
    time.sleep(5)
    plain_thread = maya.get(f"/posts/{plain['id']}/thread")
    bot_on_plain = [p for p in (plain_thread or {}).get("posts", {}).values() if p.get("user_id") == bot_id]
    try:
        assert_true(len(bot_on_plain) == 0, f"plain message triggered bot: {bot_on_plain}")
        print("  PASS non-mention silence")
    except AssertionError as e:
        failures.append(str(e))
        print(f"  FAIL non-mention silence: {e}")

    # --- DM path ---
    print("==> smoke: DM to bot without @debug")
    dm = maya.post("/channels/direct", [maya.user["id"], bot_id])
    dm_post = maya.post(
        "/posts",
        {"channel_id": dm["id"], "message": "hello debug, what is this repo?"},
    )
    dm_bot_posts = wait_thread_posts(maya, dm_post["id"], bot_id, min_bot_posts=1, timeout=25)
    try:
        assert_true(len(dm_bot_posts) >= 1, "DM did not get a bot reply")
        print("  PASS DM path")
    except AssertionError as e:
        failures.append(str(e))
        print(f"  FAIL DM path: {e}")

    # --- Busy thread ---
    print("==> smoke: busy-thread second mention")
    busy_root = maya.post(
        "/posts",
        {"channel_id": channel_id, "message": "@debug please take a moment on this one"},
    )["id"]
    # Fire a second mention quickly into the same thread.
    time.sleep(0.3)
    maya.post(
        "/posts",
        {
            "channel_id": channel_id,
            "root_id": busy_root,
            "message": "@debug and another thing while you're at it",
        },
    )
    busy_posts = wait_thread_posts(maya, busy_root, bot_id, min_bot_posts=1, timeout=25)
    try:
        texts = "\n".join(p["message"].lower() for p in busy_posts)
        assert_true(
            "still working" in texts or len(busy_posts) >= 1,
            f"expected busy reply or progress posts, got: {[p['message'] for p in busy_posts]}",
        )
        print("  PASS busy thread (best-effort)")
    except AssertionError as e:
        failures.append(str(e))
        print(f"  FAIL busy thread: {e}")

    # --- Multi-turn second mention (mapping is logged server-side; here we just ensure it responds) ---
    print("==> smoke: multi-turn follow-up mention")
    follow = maya.post(
        "/posts",
        {"channel_id": channel_id, "root_id": root_id, "message": "@debug and what about demo-reset?"},
    )
    # Wait for more bot posts beyond the original set
    follow_posts = wait_thread_posts(maya, root_id, bot_id, min_bot_posts=len(bot_posts) + 1, timeout=30)
    try:
        assert_true(len(follow_posts) > len(bot_posts), "follow-up mention got no additional bot posts")
        print("  PASS multi-turn follow-up")
    except AssertionError as e:
        failures.append(str(e))
        print(f"  FAIL multi-turn follow-up: {e}")

    print("")
    if failures:
        print(f"SMOKE FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("SMOKE PASSED")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"smoke.py failed: {exc}", file=sys.stderr)
        sys.exit(1)
