#!/usr/bin/env python3
"""Provision the @debug bot for the local Mattermost demo.

Idempotent: safe to re-run after `make demo` or `make demo-reset`.
Creates the bot if missing, ensures a valid bot access token is written to
`.env.local`, and joins the bot to every team and public channel so `@debug`
resolves as a mention anywhere.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("MATTERMOST_URL", "http://localhost:8065").rstrip("/") + "/api/v4"
ADMIN = {"username": "lucas", "password": "Password123!"}
BOT_USERNAME = "debug"
BOT_DISPLAY_NAME = "Debug Agent"
BOT_DESCRIPTION = "Cursor SDK debug agent — @debug me in any channel"
ENV_LOCAL = Path(__file__).resolve().parent / ".env.local"


class Client:
    def __init__(self, token: str | None = None):
        self.token = token

    def request(self, method: str, path: str, body=None, ignore_errors: bool = False):
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

    def get(self, path: str, ignore_errors: bool = False):
        return self.request("GET", path, ignore_errors=ignore_errors)[0]

    def post(self, path: str, body=None, ignore_errors: bool = False):
        return self.request("POST", path, body, ignore_errors=ignore_errors)[0]


def login(username: str, password: str) -> Client:
    client = Client()
    user, headers = client.request(
        "POST", "/users/login", {"login_id": username, "password": password}
    )
    client.token = headers.get("Token")
    if not client.token:
        raise RuntimeError("login succeeded but no Token header returned")
    client.user = user  # type: ignore[attr-defined]
    return client


def read_env_local() -> dict[str, str]:
    values: dict[str, str] = {}
    if not ENV_LOCAL.exists():
        return values
    for line in ENV_LOCAL.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def write_env_local(values: dict[str, str]) -> None:
    existing = read_env_local()
    existing.update(values)
    lines = [f"{k}={v}" for k, v in sorted(existing.items())]
    ENV_LOCAL.write_text("\n".join(lines) + "\n")
    print(f"  wrote {ENV_LOCAL}")


def token_is_valid(token: str) -> bool:
    probe = Client(token=token)
    me = probe.get("/users/me", ignore_errors=True)
    return bool(me and me.get("username") == BOT_USERNAME)


def ensure_bot(admin: Client) -> dict:
    bot = admin.post(
        "/bots",
        {
            "username": BOT_USERNAME,
            "display_name": BOT_DISPLAY_NAME,
            "description": BOT_DESCRIPTION,
        },
        ignore_errors=True,
    )
    if bot is None:
        user = admin.get(f"/users/username/{BOT_USERNAME}")
        if user is None:
            raise RuntimeError(f"failed to create or find bot user '{BOT_USERNAME}'")
        print(f"  bot '{BOT_USERNAME}' already exists (user_id={user['id']})")
        return user
    print(f"  created bot '{BOT_USERNAME}' (user_id={bot['user_id']})")
    return {"id": bot["user_id"], "username": bot["username"]}


def ensure_token(admin: Client, bot_user_id: str) -> str:
    existing = read_env_local().get("MATTERMOST_BOT_TOKEN", "")
    if existing and token_is_valid(existing):
        print("  existing MATTERMOST_BOT_TOKEN is valid — keeping it")
        return existing

    if existing:
        print("  existing MATTERMOST_BOT_TOKEN is stale/invalid — minting a new one")
    else:
        print("  minting new bot access token")

    token_obj = admin.post(
        f"/users/{bot_user_id}/tokens",
        {"description": "debug-agent bridge"},
    )
    token = token_obj["token"]
    write_env_local(
        {
            "MATTERMOST_BOT_TOKEN": token,
            "MATTERMOST_BOT_USER_ID": bot_user_id,
            "MATTERMOST_URL": os.environ.get("MATTERMOST_URL", "http://localhost:8065"),
        }
    )
    return token


def join_everywhere(admin: Client, bot_user_id: str) -> None:
    print("  joining bot to all teams and public channels...")
    teams = admin.get("/teams?page=0&per_page=200") or []
    team_count = 0
    channel_count = 0
    for team in teams:
        admin.post(
            f"/teams/{team['id']}/members",
            {"team_id": team["id"], "user_id": bot_user_id},
            ignore_errors=True,
        )
        team_count += 1
        channels = admin.get(f"/teams/{team['id']}/channels?page=0&per_page=200") or []
        for channel in channels:
            if channel.get("type") == "O":
                admin.post(
                    f"/channels/{channel['id']}/members",
                    {"user_id": bot_user_id},
                    ignore_errors=True,
                )
                channel_count += 1
    print(f"  joined {team_count} teams, {channel_count} public channels")


def main() -> int:
    print("==> Provisioning @debug bot")
    admin = login(ADMIN["username"], ADMIN["password"])
    bot = ensure_bot(admin)
    bot_user_id = bot["id"]
    ensure_token(admin, bot_user_id)
    join_everywhere(admin, bot_user_id)
    print("==> Done. Bot is ready — start the bridge with `make demo-agent`.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # surface a clean error for the Makefile
        print(f"provision.py failed: {exc}", file=sys.stderr)
        sys.exit(1)
