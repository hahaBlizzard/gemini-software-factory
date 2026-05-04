#!/usr/bin/env node
const fs = require('fs');
const { readState, appendLog } = require('./shared');

const WORKFLOW_AGENTS = new Set(['ceo', 'pm', 'dev', 'tester']);

function main() {
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch (e) {}

  const state = readState();
  const toolName = input.tool_name;

  // If no state exists or tool is not a workflow agent, allow immediately
  if (!state || !WORKFLOW_AGENTS.has(toolName)) {
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // Even if tool matches, if we are idle, don't block (isolation)
  if (state.status !== 'running') {
      console.log(JSON.stringify({ decision: 'allow' }));
      return;
  }

  appendLog(`Event: BeforeTool | Tool: ${toolName} | State: ${state.status} | Phase: ${state.current_phase}`);

  if (!state.current_phase) {
    console.log(JSON.stringify({
      decision: 'deny',
      reason: 'No active software factory workflow. Start one with /factory-run <requirement>.',
      systemMessage: 'Software Factory guard blocked sub-agent delegation without an active workflow.'
    }));
    return;
  }

  if (toolName !== state.current_phase) {
    console.log(JSON.stringify({
      decision: 'deny',
      reason: `Phase gate violation: only '${state.current_phase}' may run right now, not '${toolName}'.`,
      systemMessage: `Software Factory phase gate blocked '${toolName}'. Expected '${state.current_phase}'.`
    }));
    return;
  }

  console.log(JSON.stringify({ decision: 'allow' }));
}

main();
