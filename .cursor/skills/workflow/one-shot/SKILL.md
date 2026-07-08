---
name: one-shot
description: Plan, critique, build, test, self-review, deep-review, and open a PR in one autonomous pass. Use when the user says one-shot, do it all, plan and build, end to end, or wants a task finished from scratch through a PR.
disable-model-invocation: true
---

# One-Shot: Plan → Critique → Build → Verify

Complete a task end-to-end: plan it, critique the plan, implement, verify, and open a PR that gets to ready to review/merge.

## Phase 1: Plan

Spawn a `plan` subagent with the user's task description and any context you have.

**Wait for the plan to complete before proceeding.**

## Phase 2: Critique

Spawn a `critique-plan` subagent.

Pass it:
1. The **original user request** (verbatim)
2. The **plan output** from Phase 1

Do NOT pass it the planner's intermediate research, codebase context, or reasoning. The critique must assess the plan on its own terms.

**Wait for the critique to complete.**

### Resolve the plan

Keep invoking the plan and critique agent until a plan is approved by both of them. Do not create new plan/critique agents, keep resuming the original subagents you created. If they reach an impasse, you must make the final decision.

## Phase 3: Build

Implement the plan. Follow the work breakdown step by step.

After each logical chunk of work:
1. Run the compiler / type checker if applicable.
2. Fix any errors before moving to the next step.

After all steps are complete:
1. Run the tests specified in the plan's validation strategy.
2. Fix any failures.

## Phase 4: Verify

Self-review the implementation against the plan's success criteria:

- [ ] Every success criterion is met
- [ ] No unrelated files were modified
- [ ] New code follows existing patterns (check the prior art cited in the plan)
- [ ] Tests pass

If any criterion fails, fix it before proceeding.

## Phase 5: Deep review

Run the thermo-nuclear review subagent and the thermo-nuclear code quality review subagent in parallel. Go through their suggestions and fix all important issues they identify that you agree are real issues.

## Phase 6: Test and demo

This phase is only relevant if you have access to the computer use subagent and record video tool.

If the change has a user-visible effect you should test it manually and make a video demonstrating the improvement.

Verify that the manual test confirms the intended changes are implemented. If the manual testing reveals issues, fix them and retry until you have confirmed the intended changes are all correctly implemented.

## Phase 7: Get PR Ready to Ship

Get your code to the remote, and if applicable create a PR.

Then use the /babysit skill to get the PR ready for review/ready to merge.

## Edge Cases

**User cancels mid-flight:** Stop cleanly. Don't leave half-committed work — either commit what's done as a WIP or stash it.

**Plan critique deadlock:** Never run the critique loop more than twice. After two rounds, proceed with noted risks.

**Pre-commit hooks fail:** Fix the issues. Never use `--no-verify`.
