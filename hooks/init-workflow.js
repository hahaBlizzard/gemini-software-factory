#!/usr/bin/env node
const { appendLog } = require('./shared');

function main() {
  appendLog('Event: SessionStart | Hook: init-workflow | Action: No-op (isolation mode)');
  console.log(JSON.stringify({}));
}

main();
