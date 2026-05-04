# Software Factory Future Roadmap

This document records the long-term direction for the `software-factory`
Gemini CLI extension so future work can continue from the same product
vision instead of rediscovering it each time.

## Product Positioning

`software-factory` should become a guarded agentic SDLC orchestrator for
Gemini CLI.

In plain terms:

> A controlled multi-agent software factory that turns a requirement into
> architecture, PRD, implementation, tester validation, retry loops, and
> reusable project memory.

The goal is not to compete as another generic code review plugin. The
differentiation is a stateful delivery workflow:

- Role separation: CEO, PM, Dev, Tester.
- Phase gates: only the approved next phase can run.
- Checkpoints: every phase must produce a machine-readable JSON result.
- Artifacts: each phase should leave useful files for humans and later agents.
- Memory: failures and strong patterns should become reusable future guidance.

## Ecosystem Context

Gemini CLI extensions package prompts, MCP servers, and custom commands. The
strongest nearby references in the Gemini ecosystem include:

- Conductor: specify, plan, and implement software features.
- Security: vulnerability analysis over code changes and pull requests.
- Code Review: review code changes.
- Workspace: connect Gemini CLI to Google Workspace.

Claude Code plugins provide a useful comparison point because they package
slash commands, subagents, MCP servers, and hooks together. Their hook system
also shows the value of enforcing behavior at key workflow events, not just
relying on prompt instructions.

For this project, the strongest lane is:

> A workflow plugin that gives Gemini CLI a repeatable, auditable, guarded
> software delivery loop.

## Strategic Principles

1. Make the workflow reliable before making it broader.
2. Prefer explicit state, artifacts, and validation over hidden prompt behavior.
3. Treat hooks as enforcement boundaries, not only convenience scripts.
4. Keep agents specialized and narrow.
5. Make every failure produce a reusable lesson.
6. Make every run inspectable by a human.
7. Avoid adding agents unless the workflow has a real new responsibility.

## Priority Roadmap

### P0: Productization Basics

These make the extension easier to install, understand, and debug.

- Add a complete `README.md`.
- Replace placeholder metadata in `gemini-extension.json`, especially `author`.
- Verify all prompt and agent files render correctly as UTF-8.
- Add a license.
- Add installation instructions using `gemini extensions install`.
- Add local development instructions using `gemini extensions link`.
- Add a short demo transcript showing `/factory-run` and `/factory-continue`.

Recommended new commands:

- `/factory-status`: show current workflow state, phase, retry count, requirement,
  and artifact paths.
- `/factory-reset`: safely reset workflow state to idle.
- `/factory-report`: summarize generated artifacts and final result.
- `/factory-doctor`: check directories, Node availability, hook config, state file,
  memory file, and common setup problems.

### P1: Human-Readable Artifacts

The JSON checkpoint contract is good for guards, but humans also need readable
outputs.

Each phase should produce both:

- A strict JSON checkpoint for automation.
- A Markdown artifact for review.

Suggested artifacts:

- `.agents/outputs/architecture_snapshot.md`
- `.agents/outputs/prd.md`
- `.agents/outputs/implementation_summary.md`
- `.agents/outputs/test_report.md`
- `.agents/outputs/factory_report.md`

The final report should include:

- Original requirement.
- Architecture decision summary.
- Acceptance criteria.
- Changed files.
- Tests or validation performed.
- Retry history.
- Memory entries written or reused.
- Final pass/fail result.

### P2: Stronger Hook Enforcement

Current hooks already initialize state, inject workflow context, enforce phase
gates, and validate checkpoints. The next step is turning hooks into stronger
safety and quality boundaries.

Potential guardrails:

- Block workflow agents when no workflow is active.
- Block Dev edits outside the target directory unless CEO explicitly allows it.
- Block destructive shell commands during workflow execution.
- Require Tester to produce or update `test_report.md`.
- Require Dev to produce `implementation_summary.md`.
- Detect invalid or missing JSONL memory entries.
- Detect retry limit exhaustion and produce a clear failure report.
- Record phase start/end timestamps for observability.

Design note:

- Do not rely only on prompt instructions for critical policy.
- Put critical policy in hooks whenever Gemini CLI exposes enough event data.

### P3: Memory System Upgrade

The current `.agents/logs/evolution.jsonl` contract is a strong foundation.
The next step is to make memory retrieval tool-driven instead of relying on
agents manually reading the file.

Short-term helper scripts:

- `memory-search`: filter by topic, tags, phase, severity, or file path.
- `memory-append`: validate schema and append one JSONL entry.
- `memory-dedupe`: detect near-duplicate lessons.
- `memory-summary`: produce a compact memory digest for the current task.

Long-term MCP tools:

- `memory.search`
- `memory.append`
- `memory.validate`
- `memory.summarize`

Future vector migration:

- Embed `summary + action_rule + reuse_hint`.
- Preserve structured metadata fields.
- Keep the original JSONL as append-only audit history.
- Use hybrid retrieval: metadata filter first, semantic search second.

### P4: Testing And Fixtures

The extension needs tests before it can be trusted as a workflow product.

Recommended test coverage:

- Hook unit tests:
  - `init-workflow.js`
  - `workflow-context.js`
  - `phase-gate.js`
  - `validate-checkpoint.js`
- State transition tests:
  - idle -> ceo
  - ceo -> pm
  - pm -> dev
  - dev -> tester
  - tester retry -> dev
  - tester pass -> completed
  - retry limit exceeded
- Failure tests:
  - malformed JSON checkpoint
  - wrong phase checkpoint
  - wrong agent call
  - empty requirement
  - corrupt workflow state
  - corrupt memory JSONL
- Cross-platform tests:
  - Windows path separator
  - macOS/Linux path separator
  - spaces in workspace paths

Recommended fixture workflows:

- Tiny CLI app.
- Bug fix in an existing codebase.
- Refactor with tight acceptance criteria.
- Test-only task.
- Intentional Dev overengineering, requiring Tester retry.

### P5: Workflow Extensions

Once the core path is stable, add optional workflow modes.

Possible modes:

- `fast`: CEO -> Dev -> Tester for small tasks.
- `full`: CEO -> PM -> Dev -> Tester.
- `review-only`: Tester validates an existing diff.
- `prd-only`: CEO -> PM, then stop.
- `repair`: Tester -> Dev loop starting from an existing failure.

Possible future roles:

- Security reviewer, only for security-sensitive tasks.
- Docs writer, only when user asks for docs or public package readiness.
- Release manager, only for changelog/version/release tasks.

Do not add roles by default. New roles should be opt-in and tied to a clear
workflow need.

### P6: Observability

Make the workflow inspectable after every run.

Useful data to record:

- Workflow ID.
- Requirement.
- Phase timeline.
- Agent called per phase.
- Checkpoint payloads.
- Artifact paths.
- Retry reasons.
- Memory entries read or written.
- Final status.

Potential files:

- `.agents/logs/workflow-events.jsonl`
- `.agents/logs/phase-timeline.jsonl`
- `.agents/outputs/factory_report.md`

Eventually, this could support a simple dashboard, but a good Markdown report
is enough for the first version.

## Quality Bar

A release-ready version should satisfy these conditions:

- Fresh install works from a GitHub URL.
- `/factory-doctor` can diagnose common setup issues.
- `/factory-status` always reflects the real state.
- Invalid phase transitions are blocked.
- Invalid checkpoints are blocked.
- Retry limit behavior is clear and recoverable.
- Every successful run leaves a useful final report.
- Every meaningful Tester failure writes a reusable memory entry.
- README explains the workflow with one concrete example.
- Tests cover the hook state machine.

## Near-Term Suggested Order

1. Fix metadata and encoding issues.
2. Add `README.md`.
3. Add `/factory-status`.
4. Add `/factory-reset`.
5. Add `/factory-report`.
6. Add `/factory-doctor`.
7. Add hook unit tests.
8. Add memory helper scripts.
9. Add end-to-end fixtures.
10. Prepare a tagged release.

## Product Narrative

The public story should be simple:

> Most coding agents are powerful but easy to steer into messy, unreviewed
> changes. Software Factory adds a guarded delivery loop: plan first, write a
> PRD, implement narrowly, test strictly, retry with root-cause feedback, and
> preserve lessons for the next run.

That is the core value. Keep future work pointed at it.
