#!/usr/bin/env node
const fs = require('fs');
const { readState, writeState, appendLog, defaultState, startWorkflow, MANAGEMENT_COMMANDS } = require('./shared');

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part && part.text) || ''))
      .join('\n');
  }
  return '';
}

function getLastUserText(input) {
  const messages = input.llm_request && Array.isArray(input.llm_request.messages)
    ? input.llm_request.messages
    : [];
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (lastUser) return extractText(lastUser.content);
  if (input.prompt) return extractText(input.prompt);
  return '';
}

function extractRequirement(text) {
  const match = text.match(/<user_requirement>\s*([\s\S]*?)\s*<\/user_requirement>/i);
  return match ? match[1].trim() : '';
}

function parseSlashCommand(text) {
  const normalized = (text || '').trim();
  if (!normalized.startsWith('/')) return null;
  const match = normalized.match(/^\/([^\s]+)\s*([\s\S]*)$/);
  if (!match) return null;
  return {
    command: match[1].toLowerCase(),
    args: (match[2] || '').trim(),
  };
}

function main() {
  const inputRaw = fs.readFileSync(0, 'utf8') || '{}';
  const input = JSON.parse(inputRaw);
  const lastUserText = getLastUserText(input);
  const slash = parseSlashCommand(lastUserText);
  let state = readState();

  const isInitCommand = (slash && slash.command === 'factory-init') || lastUserText.includes('[SYSTEM: SWARM INITIALIZATION]');
  const isRunCommand = (slash && slash.command === 'factory-run') || lastUserText.includes('[SYSTEM: SOFTWARE FACTORY PIPELINE ACTIVATED]');
  const isLiteCommand = (slash && slash.command === 'factory-lite') || lastUserText.includes('[SYSTEM: SOFTWARE FACTORY LITE ACTIVATED]');
  const isContinueCommand = (slash && slash.command === 'factory-continue');
  const isManagementCommand = slash && MANAGEMENT_COMMANDS.has(slash.command);

  // If management command, bypass injection to avoid forced sub-agent delegation
  if (isManagementCommand) {
    if (slash.command === 'factory-reset') {
      const resetState = defaultState();
      resetState.management_command = 'factory-reset';
      writeState(resetState);
    } else if (state) {
      state.management_command = slash.command;
      writeState(state);
    }
    console.log(JSON.stringify({}));
    return;
  }

  // If no state and not starting a workflow, be silent
  if (!state && !isInitCommand && !isRunCommand && !isLiteCommand && !isContinueCommand) {
    console.log(JSON.stringify({}));
    return;
  }

  // Initialize state if needed
  if (!state && (isInitCommand || isRunCommand || isLiteCommand || isContinueCommand)) {
    state = defaultState();
  }

  appendLog(`Event: BeforeAgent | Slash: ${slash ? slash.command : 'none'} | Status: ${state ? state.status : 'none'}`);

  if (isInitCommand) {
    state = defaultState();
    writeState(state);
  } else if (isRunCommand || isLiteCommand) {
    const requirement = (slash && (slash.command === 'factory-run' || slash.command === 'factory-lite'))
      ? slash.args
      : extractRequirement(lastUserText);
    startWorkflow(state, 'ceo', requirement, isLiteCommand);
    writeState(state);
  }

  const freshState = readState();
  if (!freshState || (freshState.status === 'idle' && !isContinueCommand)) {
      // If idle and not trying to continue, we don't need to inject context for normal use
      // unless we want to show the guard even when idle?
      // The user wants it to NOT be used normally.
      console.log(JSON.stringify({}));
      return;
  }

  const context = [
    '## Workflow Guard',
    `status: ${freshState.status}`,
    `current_phase: ${freshState.current_phase || 'none'}`,
    `workflow_mode: ${freshState.fast_run ? 'lite' : 'full'}`,
    `retry_count: ${freshState.retry_count || 0}`,
    `workflow_started_at: ${freshState.workflow_started_at || 'none'}`,
    `phase_started_at: ${freshState.phase_started_at || 'none'}`,
    `requirement: ${freshState.requirement || 'none'}`,
    'required_artifacts:',
    '- ceo: .agents/outputs/architecture_snapshot.md',
    '- pm: .agents/outputs/prd.md',
    '- dev: .agents/outputs/implementation_summary.md',
    '- tester: .agents/outputs/test_report.md',
    'Policy:',
    '- During an active workflow, call exactly one allowed sub-agent tool.',
    '- Valid workflow sub-agent tools are: ceo, pm, dev, tester.',
    '- Dev success automatically hands off to Tester; Tester retry still waits for user confirmation.',
    '- Return only a single JSON object as the final answer when a workflow is active.',
    '- If status is idle and the user tries to continue, tell them to run /factory-run <requirement> (or /factory-lite).'
  ].join('\n');

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'BeforeAgent',
      additionalContext: context
    }
  }));
}

main();
