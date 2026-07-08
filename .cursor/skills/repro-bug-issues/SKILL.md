---
name: repro-bug-issues
description: "Reproduce bug reports posted in #demo-bug-automation in the running Excalidraw app, post evidence (a screen recording, screenshots, and a few plain hypotheses) as a live status card in that channel, and on a confirmed repro hand off to ship-change-from-automation to fix it and open a PR. Invoked by the 'Repro Bug Issues' automation."
disable-model-invocation: true
---

# Excalidraw bug repro (via #demo-bug-automation)

You reproduce bug reports from the `#demo-bug-automation` Slack channel
(`C0BDFGEA81E`). A message there triggered this run. Reproduce the reported symptom
in a real, running Excalidraw build, post a status card with the evidence (a screen
recording and screenshots, plus a few plain hypotheses), and on a confirmed repro
follow `.cursor/skills/ship-change-from-automation/SKILL.md` to fix the bug and open a
PR. Every other outcome is repro only.

Excalidraw is the web whiteboard app in this repo. The dev server runs at
`http://localhost:3001` in the cloud-agent VM (launched by `.cursor/environment.json`).
Write like a person: plain words, no filler, no em dashes, no jargon.

This is the middle of a three-part chain modeled on a real internal automation:

1. **Triage** (upstream, optional for this demo): classify the report and file a Linear
   ticket. Today this is the `.cursor/automations/create-linear-ticket.md` slot. If no
   triage verdict is required, treat the trigger message itself as the report.
2. **Repro** (this skill): reproduce the bug and post evidence.
3. **Fix** (`ship-change-from-automation`): implement, demo, open the PR, post the summary.

For a tight demo this run does steps 2 and 3 itself in one pass, so a single status card
goes Reproducing -> Reproduced -> opened PR.

## Demo branch contract (non-negotiable)

This automation reproduces and fixes on one branch, then opens the PR against another:

- `WORK_BRANCH = demo-bug-automation-repro-bug` — the branch you check out, reproduce on,
  and commit the fix to. It contains the planted bug and this skill.
- `BASE_BRANCH = demo-bug-automation-main` — the PR target. It contains the same planted
  bug, so the PR diff is exactly your fix.

The two branches are identical at the start of a run (same base, same bug). At the very
start: `git fetch origin && git checkout demo-bug-automation-repro-bug`. If the reported
symptom's buggy code is not present there, this is a setup error: stop and say so, do not
open a PR.

Commit the fix onto `demo-bug-automation-repro-bug` and open the PR with
`--head demo-bug-automation-repro-bug --base demo-bug-automation-main`, so the PR reads as
repro-bug into main and the diff is only your fix. Never PR against `master` or upstream
main, and never target a branch that does not contain the bug, or the diff will be noise
instead of the fix.

## Before anything else: source-channel safety

1. Set `SOURCE_CHANNEL = C0BDFGEA81E` (#demo-bug-automation).
2. Parse the immutable source root. If the trigger is a root message,
   `SOURCE_THREAD_TS = trigger.ts`. If it is a reply, `SOURCE_THREAD_TS = trigger.thread_ts`,
   never the reply's `ts`.
3. If `SOURCE_THREAD_TS` is empty or the coordinates are uncertain, stop without posting.

You post in `SOURCE_CHANNEL` only: the status card (a root message you own and update)
and threaded evidence replies under it. Subagents never post to Slack and never receive a
Slack token or posting instructions. Use `readonly: true` subagents for code investigation
and media review only.

## Slack: status card vs. fallback

The whole demo payoff is one **status card**: a single message you post once and then edit
in place as the run advances, with the recording and screenshots in its thread. Editing a
Slack message requires the same identity that posted it, so the card needs a bot token.
This skill is token-optional:

- **If `$DEMO_SLACK_BOT_TOKEN` is set** (a Slack Web API bearer token for a bot in this
  workspace): post the card with `chat.postMessage` and update it with `chat.update`. This
  is the preferred path. After every `chat.update`, re-read the message with
  `conversations.history` (`channel=SOURCE_CHANNEL`, `latest=<ts>`, `inclusive=true`,
  `limit=1`) and confirm the new text landed. `ok:true` alone is not proof.
- **If no token is available**: use the `SendSlackMessage` automation tool instead. You
  cannot edit, so post a short thread instead of editing one card: an initial
  "Reproducing..." message, then a threaded reply with the outcome and media, then a final
  reply with the PR link. `SendSlackMessage` posts as the Cursor app, so a human replying
  "@cursor ..." in the thread resumes this agent. It uploads media you reference inline as
  `<img src="/opt/cursor/artifacts/NAME.png" alt="..." />` and
  `<video src="/opt/cursor/artifacts/NAME.mp4" controls></video>`.

Pick the path once at the start and keep `STATUS_TS` (the card's `ts`, or the first
thread message's `ts` in the fallback) for the rest of the run.

Run every message through `.cursor/skills/ship-change-from-automation` voice rules: plain,
short, no em dashes.

## Workflow

Create this todo list and update it as you go:

1. Read the trigger, stop if it is not a bug report
2. Post the status card ("Reproducing...")
3. Investigate and reproduce in the running app
4. Capture evidence: recording and screenshots
5. Update the card with the outcome and post the evidence
6. On a confirmed repro, follow ship-change-from-automation to fix it and open a PR
7. Advance the card to "opened PR" and link it

### 1. Pre-gate: is this a bug report?

Read the triggering message. If it plainly is not a problem report (an FYI, a question, an
announcement, channel chatter, someone flagging their own known breakage with the
workaround already stated), stop silently without posting. The tell: nothing to
investigate. When in doubt, proceed.

If an upstream triage verdict is part of your setup, only proceed on a Bug or Performance
verdict, and capture the Linear ticket it filed so you can quote it later. For the
repro+PR demo with no triage automation wired up, the trigger message is the report.

### 2. Post the status card

Post one message to `SOURCE_CHANNEL` per the Slack rules above. Use the templates in
[slack.md](./slack.md). The initial state is the "Reproducing..." card. Capture its `ts`
as `STATUS_TS` (in the fallback, this is the first thread message's `ts`). Keep
`STATUS_TS` for the whole run.

### 3. Investigate and reproduce

Study the report first. Pull the exact symptom and the steps from it, including any
attached screenshots or recordings.

Reproduce in the running app, not by reading code. The dev server is already at
`http://localhost:3001` (started by `.cursor/environment.json`; check the terminal panes
before restarting). Follow the computer-use procedure in
`.cursor/skills/ship-change-from-automation/demo.md`: open the app in the VM browser, set
up the scene, and drive the reported path with real mouse and keyboard.

- Spawn a `readonly: true` subagent for code investigation (where the bug likely lives in
  `packages/excalidraw`, `packages/element`, or `packages/common`). It returns findings
  only.
- **Reproduce the discriminating symptom, not a step toward it.** Name the correct
  behavior and the buggy behavior for this exact report, drive to where they diverge, and
  confirm you landed on the buggy one. A dialog or loading state that also appears in
  normal use is setup, not the bug.
- Produce the exact symptom at least twice in a row before calling it reproduced. One
  observation can be flake.
- No code changes during the repro. The fix comes only after a confirmed repro, in step 6.

Bound the effort at ~30-45 minutes of real attempts. If it has not reproduced by then,
that is a clean outcome: report "could not repro" in step 5 and stop. If the app or the
browser never comes up, treat the attempt as blocked, say so in the card, and stop.

### 4. Capture evidence

On a successful repro, while the symptom is on screen:

- A screen recording of the repro path showing the symptom.
- Screenshots of the broken state, including the discriminating after-state.

Save captures under `/opt/cursor/artifacts/` so the replies can reference them with inline
artifact tags. If that dir is unavailable, use `/tmp`. Never commit them. Before posting,
have a `readonly: true` subagent confirm the recording shows the buggy after-state, not
just an expected intermediate state. If the evidence does not unambiguously show the bug,
treat it as cannot repro.

### 5. Update the card with the outcome

The moment you decide the outcome, update the card (token path: `chat.update` then re-read
to verify; fallback: post the outcome reply). Use the outcome templates in
[slack.md](./slack.md):

- **Reproduced:** status line `:mag: *Reproduced*`. Then, in the card's thread, post the
  recording and screenshots plus a few plain sentences of hypotheses: what you saw, where
  the bug might live, what you would check first.
- **Could not repro / blocked:** status line `:warning: *Could not repro*` followed by 1-3
  plain bullets with the reason. Post no media. The run ends here.

### 6. Fix and open a PR (confirmed repro only)

On a confirmed repro, read and follow
`.cursor/skills/ship-change-from-automation/SKILL.md` and run it end to end: understand the
bug, write a failing test, fix it, re-demo the fixed behavior with computer use, open the
PR with the embedded artifacts, and post its summary. That skill owns the fix procedure,
the PR template ([pr.md](../ship-change-from-automation/pr.md)), and its tests gate
(`yarn test:typecheck` and focused `yarn vitest` runs must pass).

Commit the fix onto `WORK_BRANCH` (`demo-bug-automation-repro-bug`) and open the PR with
`--head demo-bug-automation-repro-bug --base demo-bug-automation-main` (the demo branch
contract above). The PR diff must be only your fix, not the bug commit, so both branches
must already contain the bug.

Link the fix to the Linear Excalidraw project (`LUC-`) if a ticket exists, so the PR
auto-links. Could-not-repro and blocked runs skip this step.

### 7. Advance the card to "opened PR"

Once the PR is open, advance the same status card to the opened-PR shape in
[slack.md](./slack.md): status line `:white_check_mark: *Reproduced and opened <PR link>*`,
keeping any link lines unchanged (token path: `chat.update` then re-read to verify;
fallback: one threaded reply with the PR link). Write the PR as a real GitHub link
(`https://github.com/tunaSandwichCursor/excalidraw/pull/<id>`), never a bare number.

## Hard rules

- On a confirmed repro, follow ship-change-from-automation to fix it and open a PR. Every
  other outcome is repro only: no code changes, no PR.
- Run from `WORK_BRANCH` (`demo-bug-automation-repro-bug`) and open the PR with
  `--head demo-bug-automation-repro-bug --base demo-bug-automation-main`. Never PR against
  `master`, upstream main, or any branch that does not contain the planted bug.
- The exact symptom, at least twice, through real UI interaction at `http://localhost:3001`,
  or it did not reproduce.
- Reproduce in the running app. Reading code is investigation, not a repro.
- One status card per run. Edits to it only advance its status line
  (Reproducing -> Reproduced -> opened PR, or Reproducing -> Could not repro).
- An edit you did not verify did not happen. On the token path, re-read with
  `conversations.history` after every `chat.update`. `ok:true` alone is not proof.
- A trigger that is not a bug report ends the run silently with no post.
- Subagents never post to Slack and never receive a Slack token or posting instructions.
- Never commit captures, recordings, or logs, and never paste a token anywhere.
