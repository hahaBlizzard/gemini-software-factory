const fs = require('fs');
const path = require('path');

const WORKFLOW_AGENTS = new Set(['ceo', 'pm', 'dev', 'tester']);
const MANAGEMENT_COMMANDS = new Set(['factory-status', 'factory-reset', 'factory-doctor', 'factory-report']);

const ARTIFACTS = {
  architecture: '.agents/outputs/architecture_snapshot.md',
  prd: '.agents/outputs/prd.md',
  implementation: '.agents/outputs/implementation_summary.md',
  testReport: '.agents/outputs/test_report.md',
  factoryReport: '.agents/outputs/factory_report.md',
};

function findWorkspaceFromAncestors(startDir) {
  let current = path.resolve(startDir);
  let bestRoot = current;
  let foundAgents = false;

  while (true) {
    if (fs.existsSync(path.join(current, '.agents'))) {
      bestRoot = current;
      foundAgents = true;
    } 
    else if (!foundAgents && fs.existsSync(path.join(current, '.git'))) {
      bestRoot = current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return bestRoot;
}

function getProjectDir() {
  const cliArg = process.argv[2];
  const cwd = process.cwd();
  
  let result;
  if (cliArg && cliArg.trim() && cliArg !== 'undefined') {
    result = path.resolve(cliArg.trim());
  } else if (process.env.GEMINI_PROJECT_DIR && process.env.GEMINI_PROJECT_DIR.trim()) {
    result = path.resolve(process.env.GEMINI_PROJECT_DIR.trim());
  } else {
    result = findWorkspaceFromAncestors(cwd);
  }
  return result;
}

function getStatePath() {
  return path.join(getProjectDir(), '.agents', 'workflow-state.json');
}

function getAgentsDir() {
  return path.join(getProjectDir(), '.agents');
}

function getOutputsDir() {
  return path.join(getAgentsDir(), 'outputs');
}

function getLogsDir() {
  return path.join(getAgentsDir(), 'logs');
}

function getEvolutionPath() {
  return path.join(getLogsDir(), 'evolution.jsonl');
}

function resolveProjectPath(relativePath) {
  return path.join(getProjectDir(), relativePath.replace(/[\\/]/g, path.sep));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function countFileLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) return 0;
  return raw.split(/\r?\n/).filter((line) => line.trim()).length;
}

function getArtifactMtimes() {
  const mtimes = {};
  for (const relativePath of Object.values(ARTIFACTS)) {
    const artifactPath = resolveProjectPath(relativePath);
    mtimes[relativePath] = fs.existsSync(artifactPath) ? fs.statSync(artifactPath).mtimeMs : 0;
  }
  return mtimes;
}

function defaultState() {
  return {
    workflow: 'software-factory',
    status: 'idle',
    current_phase: null,
    requirement: null,
    fast_run: false,
    retry_count: 0,
    validation_retry_count: 0,
    last_checkpoint: null,
    workflow_started_at: null,
    phase_started_at: null,
    phase_completed_at: null,
    phase_history: [],
    phase_artifact_mtimes: {},
    phase_memory_line_count: 0,
    updated_at: new Date().toISOString()
  };
}

function readState() {
  const statePath = getStatePath();
  if (!fs.existsSync(statePath)) return null;
  try {
    const raw = fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeState(state) {
  if (!state) return;
  const statePath = getStatePath();
  ensureDir(path.dirname(statePath));
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function startPhase(state, phase) {
  const timestamp = new Date().toISOString();
  state.current_phase = phase;
  state.phase_started_at = timestamp;
  state.phase_completed_at = null;
  state.phase_artifact_mtimes = getArtifactMtimes();
  state.phase_memory_line_count = countFileLines(getEvolutionPath());
  state.phase_history = Array.isArray(state.phase_history) ? state.phase_history : [];
  state.phase_history.push({
    phase,
    started_at: timestamp,
    completed_at: null,
    status: 'running',
  });
}

function startWorkflow(state, phase, requirement, fastRun) {
  state.status = 'running';
  state.requirement = requirement || null;
  state.fast_run = !!fastRun;
  state.retry_count = 0;
  state.validation_retry_count = 0;
  state.last_checkpoint = null;
  state.workflow_started_at = new Date().toISOString();
  state.phase_history = [];
  startPhase(state, phase);
}

function completePhase(state, phase, payload) {
  const timestamp = new Date().toISOString();
  state.phase_completed_at = timestamp;
  state.phase_history = Array.isArray(state.phase_history) ? state.phase_history : [];
  const currentEntry = [...state.phase_history].reverse().find((entry) => entry.phase === phase && !entry.completed_at);
  if (currentEntry) {
    currentEntry.completed_at = timestamp;
    currentEntry.status = (payload && payload.status) || 'completed';
    currentEntry.checkpoint = payload && payload.checkpoint;
  }
}

function artifactUpdatedSincePhaseStart(state, relativePath) {
  const artifactPath = resolveProjectPath(relativePath);
  if (!fs.existsSync(artifactPath)) {
    return { ok: false, error: `${relativePath} is missing.` };
  }

  const stat = fs.statSync(artifactPath);
  const baseline = state && state.phase_artifact_mtimes
    ? Number(state.phase_artifact_mtimes[relativePath] || 0)
    : 0;

  if (baseline > 0 && stat.mtimeMs <= baseline) {
    return { ok: false, error: `${relativePath} was not updated during the current phase.` };
  }

  if (!baseline && state && state.phase_started_at) {
    const phaseStart = Date.parse(state.phase_started_at);
    if (Number.isFinite(phaseStart) && stat.mtimeMs + 1000 < phaseStart) {
      return { ok: false, error: `${relativePath} is older than the current phase start.` };
    }
  }

  return { ok: true };
}

function readNewMemoryEntries(state) {
  const evolutionPath = getEvolutionPath();
  if (!fs.existsSync(evolutionPath)) return [];

  const lines = fs.readFileSync(evolutionPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter((entry) => entry.line.trim());

  const baseline = Math.max(0, Number((state && state.phase_memory_line_count) || 0));
  return lines.slice(baseline);
}

function validateMemoryEntry(payload, lineNumber) {
  const errors = [];
  const requiredStrings = ['id', 'timestamp', 'type', 'topic', 'severity', 'trigger', 'summary', 'action_rule', 'reuse_hint', 'outcome'];
  for (const field of requiredStrings) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      errors.push(`line ${lineNumber}: ${field} must be a non-empty string`);
    }
  }

  const phase = payload.current_phase || payload.phase;
  if (typeof phase !== 'string' || !phase.trim()) {
    errors.push(`line ${lineNumber}: current_phase or phase must be a non-empty string`);
  }

  if (!Array.isArray(payload.tags) || payload.tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
    errors.push(`line ${lineNumber}: tags must be an array of non-empty strings`);
  }

  if (!['system', 'lesson', 'pattern', 'decision', 'anti_pattern'].includes(payload.type)) {
    errors.push(`line ${lineNumber}: type is invalid`);
  }

  if (!['low', 'medium', 'high'].includes(payload.severity)) {
    errors.push(`line ${lineNumber}: severity is invalid`);
  }

  if (Number.isNaN(Date.parse(payload.timestamp))) {
    errors.push(`line ${lineNumber}: timestamp must be ISO-8601 parseable`);
  }

  return errors;
}

function validateNewMemoryEntries(state, options = {}) {
  const newEntries = readNewMemoryEntries(state);
  if (options.requireEntry && newEntries.length === 0) {
    return {
      ok: false,
      error: 'Tester retry requires at least one new memory entry in .agents/logs/evolution.jsonl.',
    };
  }

  const errors = [];
  for (const entry of newEntries) {
    let parsed;
    try {
      parsed = JSON.parse(entry.line);
    } catch (error) {
      errors.push(`line ${entry.lineNumber}: invalid JSON (${error.message})`);
      continue;
    }
    errors.push(...validateMemoryEntry(parsed, entry.lineNumber));
  }

  return {
    ok: errors.length === 0,
    error: errors.join('; '),
    count: newEntries.length,
  };
}

function artifactStatus(relativePath) {
  const artifactPath = resolveProjectPath(relativePath);
  if (!fs.existsSync(artifactPath)) return `${relativePath}: missing`;
  const stat = fs.statSync(artifactPath);
  return `${relativePath}: present, ${stat.size} bytes, updated ${stat.mtime.toISOString()}`;
}

function formatPhaseHistory(state) {
  const history = Array.isArray(state && state.phase_history) ? state.phase_history : [];
  if (!history.length) return '- No phase history recorded.';
  return history.map((entry) => {
    const completed = entry.completed_at || 'in progress';
    const checkpoint = entry.checkpoint ? `, checkpoint: ${entry.checkpoint}` : '';
    return `- ${entry.phase}: ${entry.started_at || 'unknown'} -> ${completed} (${entry.status || 'unknown'}${checkpoint})`;
  }).join('\n');
}

function writeFactoryReport(options = {}) {
  const state = options.state || readState() || defaultState();
  const reportPath = resolveProjectPath(ARTIFACTS.factoryReport);
  ensureDir(path.dirname(reportPath));

  const checkpoint = state.last_checkpoint
    ? JSON.stringify(state.last_checkpoint, null, 2)
    : 'No checkpoint recorded.';

  const memoryCount = countFileLines(getEvolutionPath());
  const artifacts = [
    ARTIFACTS.architecture,
    ARTIFACTS.prd,
    ARTIFACTS.implementation,
    ARTIFACTS.testReport,
  ].map(artifactStatus).map((line) => `- ${line}`).join('\n');

  const report = [
    '# Factory Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Final Status: ${options.finalStatus || state.status || 'unknown'}`,
    options.reason ? `Reason: ${options.reason}` : null,
    '',
    '## Requirement',
    state.requirement || 'No requirement recorded.',
    '',
    '## Workflow State',
    `- Mode: ${state.fast_run ? 'lite' : 'full'}`,
    `- Current phase: ${state.current_phase || 'none'}`,
    `- Retry count: ${state.retry_count || 0}`,
    `- Validation retry count: ${state.validation_retry_count || 0}`,
    `- Workflow started: ${state.workflow_started_at || 'unknown'}`,
    `- Phase started: ${state.phase_started_at || 'unknown'}`,
    `- Phase completed: ${state.phase_completed_at || 'unknown'}`,
    '',
    '## Phase Timeline',
    formatPhaseHistory(state),
    '',
    '## Last Checkpoint',
    '```json',
    checkpoint,
    '```',
    '',
    '## Artifacts',
    artifacts,
    '',
    '## Memory',
    `- .agents/logs/evolution.jsonl entries: ${memoryCount}`,
    '',
    '## Notes',
    options.note || 'Generated by Software Factory hooks.',
    '',
  ].filter((line) => line !== null).join('\n');

  fs.writeFileSync(reportPath, report, 'utf8');
  appendLog(`Factory Report Written: ${ARTIFACTS.factoryReport}`);
  return reportPath;
}

function appendLog(message) {
  try {
    const projectDir = getProjectDir();
    const statePath = getStatePath();
    // Only log to project log if .agents already exists (don't create it just for logs)
    if (fs.existsSync(path.dirname(statePath))) {
      const logDir = path.join(projectDir, '.agents', 'logs');
      ensureDir(logDir);
      const logPath = path.join(logDir, 'workflow-hooks.log');
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    }
    
    // Always fallback to central debug log
    const timestamp = new Date().toISOString();
    fs.appendFileSync('C:\\gemini-extensions\\hook-debug.log', `[${timestamp}] [${projectDir}] ${message}\n`);
  } catch (e) {}
}

module.exports = {
  ARTIFACTS,
  MANAGEMENT_COMMANDS,
  WORKFLOW_AGENTS,
  getProjectDir,
  getStatePath,
  getAgentsDir,
  getOutputsDir,
  getLogsDir,
  getEvolutionPath,
  resolveProjectPath,
  readState,
  writeState,
  appendLog,
  defaultState,
  startWorkflow,
  startPhase,
  completePhase,
  artifactUpdatedSincePhaseStart,
  validateNewMemoryEntries,
  writeFactoryReport,
};
