const fs = require('fs');
const path = require('path');

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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
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
  getProjectDir,
  getStatePath,
  readState,
  writeState,
  appendLog,
  defaultState,
};
