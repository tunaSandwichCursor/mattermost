# Slack templates for repro-bug-issues

Channel: `#demo-bug-automation` (`C0BDFGEA81E`).

The status card is one message that advances through three states over a single run. Pick
the token path or the fallback once at the start (see SKILL.md) and stay on it.

Standard emoji only. The original internal automation used custom `:bufo-*:` emoji that
will not render in this workspace.

---

## Token path (preferred): one editable card

Post once with `chat.postMessage`, then `chat.update` the same `ts` to swap only the status
line. Keep everything above the status line byte-for-byte across edits. Re-read with
`conversations.history` after each update to confirm it landed.

**State 1 - Reproducing (initial post):**

```
*<SOURCE_PERMALINK|bug report>*

:hourglass_flowing_sand: Reproducing...
```

`SOURCE_PERMALINK` is the report message's permalink (`chat.getPermalink` on
`SOURCE_THREAD_TS` in `SOURCE_CHANNEL`). Drop the link line if the permalink is unavailable;
never post a broken link.

**State 2a - Reproduced:**

```
*<SOURCE_PERMALINK|bug report>*

:mag: *Reproduced*
```

Evidence goes in the thread (see below), not in the card.

**State 2b - Could not repro / blocked:**

```
*<SOURCE_PERMALINK|bug report>*

:warning: *Could not repro*

• signed-in build never came up, dev server failed to start
• the eraser behaved normally on a fresh canvas
```

1-3 bullets, each starting with the literal `• `. The run ends here, no media.

**State 3 - Reproduced and opened PR (after the fix):**

```
*<SOURCE_PERMALINK|bug report>*

:white_check_mark: *Reproduced and opened <https://github.com/tunaSandwichCursor/excalidraw/pull/123|PR #123>*
```

---

## Thread evidence reply (on a successful repro)

Reply in the card's thread with the recording and screenshots attached as inline artifact
tags, plus a few plain sentences of hypotheses. No jargon, no code dumps.

```
Here's what I found:
• <one line: the discriminating symptom you saw>
• <one line: where the bug likely lives>
• <one line: what you'd check first>

<video src="/opt/cursor/artifacts/repro.mp4" controls></video>
<img src="/opt/cursor/artifacts/repro-after.png" alt="broken after-state" />

For the agent fixing this: re-run the repro path above to verify your fix. Write a failing
test, then fix the issue. Prove it with a before/after recording on a real build, then open
the PR.
```

---

## Fallback path (no bot token): a short thread

`SendSlackMessage` cannot edit, so post a short thread instead of one card. Keep the first
message's `ts` as `STATUS_TS` and thread the rest under it.

1. **Initial** (`is_final_message: false`): `:hourglass_flowing_sand: Reproducing the
   <SOURCE_PERMALINK|bug report>...`
2. **Outcome reply** (threaded under `STATUS_TS`): the Reproduced or Could-not-repro text
   above, with the hypotheses bullets and media attached inline (the tool uploads them).
3. **PR reply** (threaded, only on a fix): `Opened
   <https://github.com/tunaSandwichCursor/excalidraw/pull/123|PR #123>.`

Posting as the Cursor app links the thread to this run, so a human replying "@cursor ..."
resumes the agent.
