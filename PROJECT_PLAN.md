# Software Factory Project Plan

This plan turns `FUTURE_ROADMAP.md` into a practical checklist. The goal is to
move a little every day while keeping the extension reliable, inspectable, and
easy to install.

## Guiding Target

Build a guarded Gemini CLI software delivery loop:

1. Accept a requirement.
2. Route it through CEO, PM, Dev, and Tester.
3. Enforce phase gates with hooks.
4. Produce JSON checkpoints and human-readable artifacts.
5. Preserve lessons in project memory.

## Phase 1: Stabilize The Core

Outcome: the current workflow is safe to run repeatedly on real projects.

- [x] Quote hook script paths so installs under paths with spaces work.
- [x] Verify `hooks/hooks.json` is loaded by Gemini CLI extension linking.
- [x] Run a full workflow smoke test: `/factory-run` then `/factory-continue`.
- [x] Confirm phase gate blocks the wrong agent.
- [x] Confirm invalid checkpoint JSON is blocked.
- [x] Confirm tester retry advances back to `dev`.
- [x] Confirm tester pass marks workflow as completed.
- [x] Record any observed hook input shape differences.

Done when: one clean local workflow can pass from CEO to Tester, and a bad phase
or bad checkpoint is visibly blocked.

Observed hook input shapes:

- `BeforeAgent`: current Gemini CLI inputs can provide user text in `prompt`.
- `BeforeTool`: current Gemini CLI inputs provide the agent/tool name in `tool_name`.
- `AfterAgent`: current Gemini CLI inputs provide final text in `prompt_response`.

## Phase 1.5: Semi-Automatic Dev To Tester Handoff

Outcome: Dev completion can immediately trigger Tester validation, while retry
loops still wait for human confirmation.

Decision: enable this by default for the current full workflow. Future workflow
modes can make it configurable if needed.

- [x] Define the handoff rule: `dev` success may auto-run `tester`.
- [x] Keep `tester` retry output paused before returning to `dev`.
- [x] Keep CEO, PM, and PM -> Dev transitions manually confirmed.
- [x] Decide whether the feature is always on or controlled by a workflow mode.
- [x] Update hook state handling so auto-handoff is explicit and inspectable.
- [x] Add a smoke test for Dev -> Tester auto-handoff.
- [x] Document the behavior in current guard and agent instructions.

Done when: after Dev returns `DEV_IMPLEMENTATION_READY`, Tester can run without
another manual `/factory-continue`, but any retry still stops for user review.

## Phase 2: Productization Basics

Outcome: another user can install, understand, and debug the extension.

- [x] Replace placeholder metadata in `gemini-extension.json`.
- [x] Add `README.md` with install, link, and first-run instructions.
- [ ] Add a short demo transcript for `/factory-run` and `/factory-continue`.
- [x] Add license file.
- [ ] Verify UTF-8 rendering for prompts, agents, and commands.
- [x] Add `/factory-status`.
- [x] Add `/factory-reset`.
- [x] Add `/factory-doctor`.

Done when: the extension can be linked or installed fresh and the user can
diagnose common setup problems without reading source code.

## Phase 3: Human-Readable Artifacts

Outcome: each workflow run leaves useful review material for humans and later
agents.

- [ ] Standardize `.agents/outputs/architecture_snapshot.md`.
- [ ] Standardize `.agents/outputs/prd.md`.
- [ ] Add `.agents/outputs/implementation_summary.md`.
- [ ] Add `.agents/outputs/test_report.md`.
- [ ] Add `/factory-report`.
- [ ] Include requirement, decisions, AC, changed files, validation, retries,
  memory usage, and final status in the report.
- [ ] Update agent prompts so Markdown artifacts and JSON checkpoints are both
  required.

Done when: after a run, a human can read the outputs folder and understand what
was planned, changed, tested, retried, and concluded.

## Phase 4: Stronger Guardrails

Outcome: important workflow rules are enforced by code instead of prompts alone.

- [ ] Add `BeforeToolSelection` filtering for the active phase agent.
- [ ] Block workflow agents when no workflow is active.
- [ ] Require Dev to produce `implementation_summary.md`.
- [ ] Require Tester to produce or update `test_report.md`.
- [ ] Detect retry limit exhaustion and produce a clear failure report.
- [ ] Validate memory JSONL entries before accepting Tester fail/pass memory.
- [ ] Record phase start and end timestamps.
- [ ] Decide how to handle destructive shell commands during active workflows.

Done when: the most important policy failures are blocked or reported by hooks,
not merely described in prompts.

## Phase 5: Memory Tooling

Outcome: project memory becomes searchable, validated, and reusable.

- [ ] Add `memory-search` helper.
- [ ] Add `memory-append` helper with schema validation.
- [ ] Add `memory-dedupe` helper.
- [ ] Add `memory-summary` helper.
- [ ] Update CEO, Dev, and Tester prompts to prefer helpers over manual file
  scanning.
- [ ] Keep `.agents/logs/evolution.jsonl` as append-only audit history.

Done when: agents can retrieve relevant lessons without reading the whole memory
file, and new memory entries are schema-checked.

## Phase 6: Test Harness

Outcome: the hook state machine can be changed without fear.

- [ ] Add Node test runner setup.
- [ ] Test `init-workflow.js`.
- [ ] Test `workflow-context.js`.
- [ ] Test `phase-gate.js`.
- [ ] Test `validate-checkpoint.js`.
- [ ] Add state transition tests from idle through completed.
- [ ] Add failure tests for malformed JSON, wrong phase, wrong agent, empty
  requirement, corrupt state, and corrupt memory.
- [ ] Add Windows path and spaces-in-path coverage.

Done when: hook behavior is covered by automated tests and can run locally in one
command.

## Phase 7: Workflow Modes

Outcome: stable optional workflows exist without bloating the default path.

- [ ] Define `full` as CEO -> PM -> Dev -> Tester.
- [ ] Define `fast` as CEO -> Dev -> Tester.
- [ ] Define `review-only` for validating an existing diff.
- [ ] Define `prd-only` for stopping after PM.
- [ ] Define `repair` for Tester -> Dev loops from an existing failure.
- [ ] Keep every mode opt-in and documented.

Done when: one additional mode is implemented cleanly and the default workflow
remains simple.

## Daily Working Checklist

Use this loop for small daily progress:

- [ ] Pick one unchecked item.
- [ ] Write the expected behavior in one sentence.
- [ ] Make the smallest code or doc change that satisfies it.
- [ ] Run the relevant smoke test or unit test.
- [ ] Update this checklist if the work revealed a better next step.
- [ ] Record a reusable lesson in memory when something fails in an instructive
  way.

## First Seven Work Items

1. Finish hook command quoting.
2. Add README with install/link/run instructions.
3. Add `/factory-status`.
4. Add `/factory-reset`.
5. Add one full smoke-test transcript.
6. Add `implementation_summary.md` requirement.
7. Add basic hook unit tests for state transitions.
