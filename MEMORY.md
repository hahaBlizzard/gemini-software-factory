# Evolution Memory Contract

This file defines how the software factory uses `.agents/logs/evolution.jsonl`
as a structured self-improvement memory store today, while keeping the data easy
to migrate into a vector database later.

## Goals

1. Preserve reusable lessons from failed attempts.
2. Preserve successful implementation patterns worth repeating.
3. Carry forward architectural decisions and anti-patterns.
4. Keep each memory entry small, explicit, and embedding-friendly.

## Storage Format

- File: `.agents/logs/evolution.jsonl`
- Encoding: UTF-8
- Format: one JSON object per line
- Rule: every line must be independently parseable

## Required Schema

Each memory entry should use this shape:

```json
{
  "id": "stable-id-or-hash",
  "timestamp": "2026-04-27T09:30:00Z",
  "type": "lesson",
  "current_phase": "tester",
  "topic": "simplicity",
  "tags": ["python", "cli", "overengineering"],
  "severity": "medium",
  "trigger": "tester_fail",
  "summary": "Dev introduced extra abstraction not required by the PRD.",
  "action_rule": "Prefer a flat implementation when the AC stresses simplicity.",
  "reuse_hint": "Apply for small scripts and single-purpose commands.",
  "evidence": {
    "files": ["src/test_swarm/todo_lite.py"],
    "artifacts": [".agents/outputs/prd.md"]
  },
  "outcome": "retry_required"
}
```

## Field Meanings

- `id`: stable identifier or deterministic hash for deduplication
- `timestamp`: ISO-8601 UTC timestamp
- `type`: one of `system`, `lesson`, `pattern`, `decision`, `anti_pattern`
- `current_phase`: one of `system`, `ceo`, `pm`, `dev`, `tester`
- `topic`: short category such as `simplicity`, `architecture`, `io`, `testing`
- `tags`: lightweight retrieval aids for keyword or future hybrid search
- `severity`: `low`, `medium`, `high`
- `trigger`: what caused the memory to be written, such as `tester_fail`, `tester_pass`, `ceo_decision`
- `summary`: compact human-readable observation
- `action_rule`: the concrete behavior future agents should follow
- `reuse_hint`: guidance about when this memory should be applied
- `evidence`: optional supporting files or artifacts
- `outcome`: result tied to this memory, such as `retry_required`, `pass`, `adopted`, `initialized`

## Writing Rules

1. `tester` must append a `lesson` or `anti_pattern` entry on every meaningful fail.
2. `tester` may append a `pattern` entry on a strong pass worth reusing.
3. `ceo` may append a `decision` entry for durable architecture choices.
4. Do not write vague entries. Every memory must contain an actionable `action_rule`.
5. Do not write duplicate memories if an equivalent lesson already exists.

## Reading Rules

- `ceo` should prioritize `decision`, `anti_pattern`, and relevant `pattern`
- `dev` should prioritize `lesson`, `anti_pattern`, and relevant `pattern`
- `tester` should check whether the current diff repeats any known `lesson`
- `pm` may use `decision` and `lesson` to sharpen acceptance criteria

## Retrieval Heuristic for JSONL

Before a vector database exists, agents should retrieve memories by:

1. Matching `topic`
2. Matching `tags`
3. Matching likely file or artifact references
4. Preferring newer entries when multiple memories conflict
5. Preferring higher-severity `anti_pattern` and `lesson` records during review

## Vector Migration Notes

When this system moves to a vector database later:

- Embed `summary + action_rule + reuse_hint`
- Keep structured metadata fields (`type`, `phase`, `topic`, `tags`, `severity`)
- Use hybrid retrieval:
  - metadata filter first
  - vector similarity second
- Preserve the original JSONL as an append-only audit log if possible

## Minimal Examples

Lesson:

```json
{"id":"lesson-todo-simplicity-001","timestamp":"2026-04-27T09:30:00Z","type":"lesson","phase":"tester","topic":"simplicity","tags":["python","todo-lite"],"severity":"medium","trigger":"tester_fail","summary":"Implementation added helpers that were unnecessary for a 30-line script.","action_rule":"Prefer inline logic for tiny single-file CLI tools unless reuse is proven.","reuse_hint":"Apply to scripts under roughly 100 lines.","evidence":{"files":["src/test_swarm/todo_lite.py"],"artifacts":[".agents/outputs/prd.md"]},"outcome":"retry_required"}
```

Pattern:

```json
{"id":"pattern-cli-flat-001","timestamp":"2026-04-27T09:40:00Z","type":"pattern","phase":"tester","topic":"cli-design","tags":["python","cli","flat-logic"],"severity":"low","trigger":"tester_pass","summary":"A flat command-dispatch structure passed review and matched the AC well.","action_rule":"Use a small top-level command dispatcher before introducing extra modules.","reuse_hint":"Apply to tiny CLI utilities with 2-5 commands.","evidence":{"files":["src/test_swarm/todo_lite.py"],"artifacts":[".agents/outputs/test_report.md"]},"outcome":"pass"}
```
