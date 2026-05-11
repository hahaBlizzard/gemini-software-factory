#!/usr/bin/env node
const fs = require('fs');
const {
  readState,
  writeState,
  appendLog,
  ARTIFACTS,
  MANAGEMENT_COMMANDS,
  startPhase,
  completePhase,
  artifactUpdatedSincePhaseStart,
  validateNewMemoryEntries,
  writeFactoryReport,
} = require('./shared');

/**
 * Robustly cleans "dirty" JSON from LLMs.
 * Handles: physical newlines in strings, trailing commas, unescaped tabs.
 */
function cleanDirtyJson(str) {
  if (!str) return str;
  let cleaned = str.trim();

  // 1. Fix physical newlines and tabs inside double-quoted strings
  // Regex matches "..." while respecting escaped quotes \"
  cleaned = cleaned.replace(/"(?:[^"\\\\]|\\\\.)*"/g, (match) => {
    return match
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  });

  // 2. Remove trailing commas in objects and arrays
  cleaned = cleaned.replace(/,[ \t\r\n]*([}\]])/g, '$1');

  return cleaned;
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch (e1) {
    try {
      return JSON.parse(cleanDirtyJson(str));
    } catch (e2) {
      return null;
    }
  }
}

function parseCheckpoint(text, expectedPhase) {
  if (!text) return null;

  // 1. Try whole text
  let result = tryParseJson(text);
  if (result) return result;

  // 2. Try markdown extraction
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) {
    result = tryParseJson(mdMatch[1]);
    if (result) return result;
  }

  // 3. Surgical brace extraction (find all {} blocks and try them)
  const braceBlocks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      escaped = false;
    } else if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        braceBlocks.push(text.substring(start, i + 1));
      }
    }
  }

  // Try parsing all blocks
  const parsedBlocks = braceBlocks
    .map(block => tryParseJson(block))
    .filter(p => p && (p.current_phase || p.phase || p.status || p.checkpoint));

  // Prioritize those that match the expectedPhase
  if (expectedPhase) {
    const match = parsedBlocks.find(p => 
      (p.current_phase || p.phase || '').toLowerCase() === expectedPhase.toLowerCase()
    );
    if (match) return match;
  }

  // Fallback to longest JSON (heuristically likely the most recent or detailed)
  parsedBlocks.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
  return parsedBlocks[0] || null;
}

function expectedPhaseOutput(state, payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Payload is not a valid JSON object.' };
  
  // Normalize casing and support aliases
  const current_phase_in_payload = (payload.current_phase || payload.phase || '').toLowerCase().trim();
  const status = (payload.status || '').toUpperCase().trim();
  const checkpoint = (payload.checkpoint || '').toUpperCase().trim();
  const expected_phase = (state.current_phase || '').toLowerCase().trim();

  // If payload explicitly specifies a different phase, fail.
  // If it omits the phase, we assume it's the expected one.
  if (current_phase_in_payload && current_phase_in_payload !== expected_phase) {
    const err = `PHASE MISMATCH | Found: ${current_phase_in_payload} | Expected: ${expected_phase}`;
    appendLog(err);
    return { ok: false, error: err };
  }

  if (expected_phase === 'ceo') {
    const ok = status === 'WAITING_FOR_USER_APPROVAL' && 
               (checkpoint === 'CEO_BLUEPRINT_READY' || checkpoint === 'CEO_BLUEPRINT_COMPLETED' || payload.blueprint);
    if (!ok) {
      const err = `CEO VALIDATION FAIL | status: ${status} (expected: WAITING_FOR_USER_APPROVAL) | checkpoint: ${checkpoint} (expected: CEO_BLUEPRINT_READY/COMPLETED)`;
      appendLog(err);
      return { ok: false, error: err };
    }
    return { ok: true };
  }
  if (expected_phase === 'pm') {
    const ok = status === 'WAITING_FOR_USER_APPROVAL' && 
               (checkpoint === 'PM_PRD_READY' || checkpoint === 'PM_PRD_COMPLETED');
    if (!ok) {
      const err = `PM VALIDATION FAIL | status: ${status} (expected: WAITING_FOR_USER_APPROVAL) | checkpoint: ${checkpoint} (expected: PM_PRD_READY/COMPLETED)`;
      appendLog(err);
      return { ok: false, error: err };
    }
    return { ok: true };
  }
  if (expected_phase === 'dev') {
    const ok = status === 'WAITING_FOR_USER_APPROVAL' && 
               (checkpoint === 'DEV_IMPLEMENTATION_READY' || checkpoint === 'DEV_IMPLEMENTATION_COMPLETED');
    if (!ok) {
      const err = `DEV VALIDATION FAIL | status: ${status} (expected: WAITING_FOR_USER_APPROVAL) | checkpoint: ${checkpoint} (expected: DEV_IMPLEMENTATION_READY/COMPLETED)`;
      appendLog(err);
      return { ok: false, error: err };
    }
    return { ok: true };
  }
  if (expected_phase === 'tester') {
    const isRetry = status === 'RETRY_REQUIRED' && 
                    (checkpoint === 'TESTER_FIX_INSTRUCTIONS_READY' || checkpoint === 'TESTER_FIX_INSTRUCTIONS_COMPLETED' || !checkpoint);
    const isPass = status === 'FACTORY_WORKFLOW_COMPLETED' && 
                   (checkpoint === 'TESTER_PASS' || checkpoint === 'TESTER_COMPLETED' || !checkpoint);
    const ok = isRetry || isPass;
    if (!ok) {
      const err = `TESTER VALIDATION FAIL | status: ${status} | checkpoint: ${checkpoint}`;
      appendLog(err);
      return { ok: false, error: err };
    }
    return { ok: true };
  }
  return { ok: false, error: `Unknown phase: ${expected_phase}` };
}

function advanceState(state, payload) {
  const current = state.current_phase;
  const status = (payload.status || '').toUpperCase();
  completePhase(state, current, payload);

  let nextPhase = null;
  if (current === 'ceo') {
    nextPhase = state.fast_run ? 'dev' : 'pm';
  } else if (current === 'pm') {
    nextPhase = 'dev';
  } else if (current === 'dev') {
    nextPhase = 'tester';
  } else if (current === 'tester') {
    if (status === 'RETRY_REQUIRED') {
      state.retry_count = (state.retry_count || 0) + 1;
      nextPhase = 'dev';
    } else if (status === 'FACTORY_WORKFLOW_COMPLETED') {
      state.status = 'completed';
      state.current_phase = null;
    }
  }

  if (nextPhase) {
    startPhase(state, nextPhase);
  }

  // Reset structural validation retry count on success
  state.validation_retry_count = 0;
}

function shouldAutoHandoffToTester(completedPhase, state) {
  return completedPhase === 'dev' &&
    state.status === 'running' &&
    state.current_phase === 'tester';
}

function autoHandoffToTesterResponse() {
  return {
    decision: 'allow',
    reason: 'Dev checkpoint accepted. Transitioning to Tester validation.',
    systemMessage: 'Software Factory accepted the Dev checkpoint and advanced to Tester. Please call the tester sub-agent.'
  };
}

function validatePhaseSideEffects(state, payload) {
  const phase = (state.current_phase || '').toLowerCase();
  const status = (payload.status || '').toUpperCase();

  if (phase === 'dev') {
    const artifact = artifactUpdatedSincePhaseStart(state, ARTIFACTS.implementation);
    if (!artifact.ok) {
      return {
        ok: false,
        error: `Dev must create or update ${ARTIFACTS.implementation}. ${artifact.error}`,
      };
    }
  }

  if (phase === 'tester') {
    const artifact = artifactUpdatedSincePhaseStart(state, ARTIFACTS.testReport);
    if (!artifact.ok) {
      return {
        ok: false,
        error: `Tester must create or update ${ARTIFACTS.testReport}. ${artifact.error}`,
      };
    }

    const memoryValidation = validateNewMemoryEntries(state, {
      requireEntry: status === 'RETRY_REQUIRED',
    });
    if (!memoryValidation.ok) {
      return {
        ok: false,
        error: `Tester memory validation failed. ${memoryValidation.error}`,
      };
    }
  }

  return { ok: true };
}

function parseSlashCommand(text) {
  const normalized = (text || '').trim();
  if (!normalized.startsWith('/')) return null;
  const match = normalized.match(/^\/([^\s]+)/);
  if (!match) return null;
  return match[1].toLowerCase();
}

function main() {
  let input = {};
  try {
    const rawInput = fs.readFileSync(0, 'utf8') || '{}';
    input = JSON.parse(rawInput);
  } catch (e) {}
  
  const state = readState();

  if (!state) {
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  // Bypass validation for management commands marked in state
  if (state.management_command && MANAGEMENT_COMMANDS.has(state.management_command)) {
    appendLog(`Management Bypass: ${state.management_command}`);
    delete state.management_command;
    writeState(state);
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  if (state.status !== 'running' || !state.current_phase) {
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const response = typeof input.prompt_response === 'string' ? input.prompt_response.trim() : '';
  const payload = parseCheckpoint(response, state.current_phase);

  appendLog(`Event: AfterAgent | Phase: ${state.current_phase} | Parsed: ${!!payload} | Response Len: ${response.length}`);

  const validation = expectedPhaseOutput(state, payload);
  if (!payload || !validation.ok) {
    let errorMsg = validation.error || 'Unknown validation error.';
    if (!payload) {
      errorMsg = 'CRITICAL: Your output could not be parsed as a JSON object. Ensure you output ONLY the raw JSON without markdown fences or extra prose.';
      appendLog(`PARSE FAILURE | Raw response start: ${response.substring(0, 100)}`);
    } else {
      appendLog(`VALIDATION FAILURE | Payload: ${JSON.stringify(payload)}`);
    }

    // Increment validation retry count
    state.validation_retry_count = (state.validation_retry_count || 0) + 1;
    writeState(state);

    if (state.validation_retry_count >= 5) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: 'CRITICAL: Structural validation failed too many times. Manual intervention required.',
        systemMessage: `Software Factory blocked due to persistent validation failures in phase '${state.current_phase}'.`
      }));
    } else {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `VALIDATION ERROR in phase '${state.current_phase}': ${errorMsg}\n\nPlease correct your output format and retry. Attempt ${state.validation_retry_count}/5.`,
        systemMessage: `Software Factory checkpoint guard rejected the response for phase '${state.current_phase}'. Retrying...`
      }));
    }
    return;
  }

  const payloadStatus = (payload.status || '').toUpperCase();

  if ((state.retry_count || 0) >= 3 && payloadStatus === 'RETRY_REQUIRED') {
    appendLog(`RETRY LIMIT REACHED | Count: ${state.retry_count}`);
    state.last_checkpoint = payload;
    completePhase(state, state.current_phase, payload);
    state.status = 'failed';
    state.current_phase = null;
    writeFactoryReport({
      state,
      finalStatus: 'failed',
      reason: 'Tester requested another retry after the configured retry limit was reached.',
      note: 'Retry limit exhaustion was detected by validate-checkpoint.js.',
    });
    writeState(state);
    console.log(JSON.stringify({
      decision: 'block',
      reason: 'Retry limit reached. Stop requesting another dev retry and report failure clearly.',
      systemMessage: 'Software Factory retry guard blocked a fourth retry.'
    }));
    return;
  }

  const sideEffects = validatePhaseSideEffects(state, payload);
  if (!sideEffects.ok) {
    appendLog(`SIDE EFFECT VALIDATION FAILURE | ${sideEffects.error}`);
    state.validation_retry_count = (state.validation_retry_count || 0) + 1;
    writeState(state);

    if (state.validation_retry_count >= 5) {
      console.log(JSON.stringify({
        decision: 'block',
        reason: 'CRITICAL: Side-effect validation failed too many times. Manual intervention required.',
        systemMessage: `Software Factory blocked due to persistent side-effect failures in phase '${state.current_phase}'.`
      }));
    } else {
      console.log(JSON.stringify({
        decision: 'block',
        reason: `VALIDATION ERROR in phase '${state.current_phase}': ${sideEffects.error}\n\nPlease create or update the required artifact/memory file and retry. Attempt ${state.validation_retry_count}/5.`,
        systemMessage: `Software Factory side-effect guard rejected the response for phase '${state.current_phase}'.`
      }));
    }
    return;
  }

  const completedPhase = state.current_phase;
  state.last_checkpoint = payload;
  advanceState(state, payload);
  writeState(state);
  appendLog(`Phase Advanced: ${state.current_phase || 'COMPLETED'}`);

  if (shouldAutoHandoffToTester(completedPhase, state)) {
    appendLog('Auto Handoff: dev -> tester');
    console.log(JSON.stringify(autoHandoffToTesterResponse()));
    return;
  }

  console.log(JSON.stringify({ decision: 'allow' }));
}

main();
