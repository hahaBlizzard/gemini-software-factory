#!/usr/bin/env node
const fs = require('fs');
const { readState, appendLog, WORKFLOW_AGENTS } = require('./shared');

const SHELL_TOOL_NAMES = new Set([
  'run_shell_command',
  'shell',
  'execute_shell_command',
  'bash',
  'powershell',
]);

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+-(?:[^\s]*r[^\s]*f|[^\s]*f[^\s]*r)\b/i,
  /\bRemove-Item\b[\s\S]*\s-(?:Recurse|Force)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-f/i,
  /\bdel\s+\/[fsq]/i,
  /\brmdir\s+\/s\b/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs(?:\.[a-z0-9]+)?\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
];

function extractCommand(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  return toolInput.command || toolInput.cmd || toolInput.script || toolInput.input || '';
}

function isShellTool(toolName) {
  return SHELL_TOOL_NAMES.has(toolName) || /shell|bash|powershell|terminal/i.test(toolName || '');
}

function isDestructiveCommand(command) {
  return DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command || ''));
}

function main() {
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch (e) {}

  const state = readState();
  const toolName = input.tool_name;

  if (state && state.status === 'running' && isShellTool(toolName)) {
    const command = extractCommand(input.tool_input);
    if (isDestructiveCommand(command)) {
      appendLog(`Destructive Command Blocked | Tool: ${toolName} | Command: ${command}`);
      console.log(JSON.stringify({
        decision: 'deny',
        reason: 'Destructive shell commands are blocked during an active Software Factory workflow.',
        systemMessage: 'Software Factory blocked a destructive shell command while the workflow is active.'
      }));
      return;
    }
  }

  // If tool is not a workflow agent, allow immediately
  if (!WORKFLOW_AGENTS.has(toolName)) {
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  if (!state || state.status !== 'running') {
    console.log(JSON.stringify({
      decision: 'deny',
      reason: 'No active software factory workflow. Start one with /factory-run <requirement>.',
      systemMessage: 'Software Factory guard blocked workflow agent delegation without an active workflow.'
    }));
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
