#!/usr/bin/env node
const fs = require('fs');
const { readState, appendLog, WORKFLOW_AGENTS } = require('./shared');

function collectToolNames(value, names = new Set()) {
  if (!value) return names;

  if (typeof value === 'string') {
    names.add(value);
    return names;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectToolNames(item, names);
    return names;
  }

  if (typeof value !== 'object') return names;

  for (const key of ['name', 'functionName', 'function_name']) {
    if (typeof value[key] === 'string') names.add(value[key]);
  }

  if (value.function && typeof value.function.name === 'string') {
    names.add(value.function.name);
  }

  for (const key of [
    'tools',
    'available_tools',
    'availableTools',
    'toolDeclarations',
    'tool_declarations',
    'functionDeclarations',
    'function_declarations',
    'functions',
  ]) {
    collectToolNames(value[key], names);
  }

  return names;
}

function main() {
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch (error) {}

  const state = readState();
  const names = collectToolNames(input);
  const allNames = [...names];
  const visibleWorkflowAgents = allNames.filter((name) => WORKFLOW_AGENTS.has(name));

  if (!visibleWorkflowAgents.length) {
    console.log(JSON.stringify({}));
    return;
  }

  const activeAgent = state && state.status === 'running' ? state.current_phase : null;
  const allowedFunctionNames = allNames.filter((name) => {
    if (!WORKFLOW_AGENTS.has(name)) return true;
    return name === activeAgent;
  });

  appendLog(`Event: BeforeToolSelection | Active: ${activeAgent || 'none'} | Workflow tools: ${visibleWorkflowAgents.join(',')}`);

  const toolConfig = allowedFunctionNames.length
    ? { mode: 'ANY', allowedFunctionNames }
    : { mode: 'NONE', allowedFunctionNames: [] };

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'BeforeToolSelection',
      toolConfig,
    },
  }));
}

main();
