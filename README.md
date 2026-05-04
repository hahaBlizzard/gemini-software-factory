# Gemini Software Factory

A guarded multi-agent workflow extension for Gemini CLI. It routes a software
requirement through CEO, PM, Dev, and Tester agents, while hooks enforce phase
gates and checkpoint JSON so each step stays inspectable.

## What It Does

- Starts a full workflow with `/factory-run <requirement>`.
- Starts a streamlined workflow with `/factory-lite <requirement>`.
- Advances an active workflow with `/factory-continue`.
- Blocks the wrong agent from running in the wrong phase.
- Validates each agent checkpoint before the workflow can move on.
- Automatically hands off successful Dev work to Tester validation.

## Project Structure

```text
agents/                 Agent instructions for CEO, PM, Dev, and Tester
commands/               Gemini CLI slash commands
hooks/                  Workflow state, phase gate, and checkpoint hooks
gemini-extension.json   Extension manifest
GEMINI.md               Dispatcher instructions
PROJECT_PLAN.md         Productization and roadmap checklist
```

## Requirements

- Gemini CLI with extension support
- Node.js available on your PATH

The extension hooks are plain Node.js scripts and do not require npm
dependencies.

## Install Or Link

Clone the repository:

```powershell
git clone https://github.com/hahaBlizzard/gemini-software-factory.git
```

Then link or install the extension using your Gemini CLI extension workflow. If
you are developing locally, link this repository's root folder as the extension
folder.

## First Run

In a Gemini CLI workspace, start a guarded workflow:

```text
/factory-run Build a small CLI tool that validates JSON files.
```

Review the returned checkpoint. When you are ready to continue:

```text
/factory-continue
```

Repeat `/factory-continue` as each phase completes. After Dev finishes
successfully, Tester validation may run automatically. If Tester asks for a
retry, the workflow pauses for human review before returning to Dev.

For a shorter path, use:

```text
/factory-lite Build a small CLI tool that validates JSON files.
```

## Workflow

The default workflow is:

```text
CEO -> PM -> Dev -> Tester
```

Each agent must return a valid JSON checkpoint. Hooks inject the current
workflow context, block invalid phase transitions, and validate checkpoint
output after each agent run.

## Roadmap

See `PROJECT_PLAN.md` for the current productization plan and future work,
including status/reset/doctor commands, human-readable run artifacts, stronger
guardrails, memory tooling, and automated hook tests.

## License

MIT License. See `LICENSE`.
