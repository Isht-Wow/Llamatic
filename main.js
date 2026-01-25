

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const MODEL_DIR = '/Applications/AI Models';
const LOG_FILE = path.join(__dirname, 'llamatic.log');
let mainWindow = null;
let modelProcesses = new Map(); // pid -> { proc, modelPath, port }

// Helper: Scan for external llama-server processes, parse -m/--port, and also detect .gguf models without explicit -m/--model
function getExternalModels() {
  let results = [];
  try {
    const psOut = execSync('ps -axo pid=,command=', { encoding: 'utf8' });
    const lines = psOut.split('\n');

    for (const line of lines) {
      const m = line.match(/^\s*(\d+)\s+(.*llama-server.*)$/);
      if (!m) continue;
      const pid = parseInt(m[1]);
      const cmd = m[2];
      if (modelProcesses.has(pid)) continue;

      // Extract port
      let port = null;
      const portMatch = cmd.match(/--port\s+(\d+)/i);
      if (portMatch) port = parseInt(portMatch[1]);

      // Extract everything after last slash but before --port
      // This handles paths with spaces correctly
      let modelPath = null;
      const modelMatch = cmd.match(/--model\s+(.+?)\s+--port/i);
      if (modelMatch) {
        modelPath = modelMatch[1].trim().replace(/^["']|["']$/g, '');
      } else {
        // fallback: find last .gguf anywhere
        const fallbackMatch = cmd.match(/([^\s]+\.gguf)/i);
        if (fallbackMatch) modelPath = fallbackMatch[1];
      }

      // Get filename only (after last /)
      const filename = modelPath ? modelPath.split('/').pop() : 'Unknown Model';

      if (port && !results.some(r => r.port === port)) {
        results.push({
          pid,
          modelPath,
          port,
          filename,
          external: true,
        });
      }
    }
  } catch (e) {
    log(`[ERROR] getExternalModels: ${e.message}`);
  }
  return results;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // ignore logging errors
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Llamatic',
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  log('Main window created');
}

app.on('ready', () => {
  log('App ready');
  createWindow();
});

app.on('window-all-closed', () => {
  log('All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  log('App activate');
  if (mainWindow === null) {
    log('Creating new window due to activate');
    createWindow();
  }
});

app.on('before-quit', () => {
  log('App before-quit: killing all running model processes');

  // Kill internal models
  for (const [pid, procInfo] of modelProcesses.entries()) {
    try {
      process.kill(pid, 'SIGTERM');
      log(`[PROCESS] Killed internal model: pid=${pid}, model="${path.basename(procInfo.modelPath)}"`);
    } catch (e) {
      log(`[ERROR] Failed to kill internal model PID ${pid}: ${e.message}`);
    }
  }

  // Kill external models
  const externals = getExternalModels();
  for (const ext of externals) {
    try {
      process.kill(ext.pid, 'SIGTERM');
      log(`[PROCESS] Killed external model: pid=${ext.pid}, model="${ext.filename}"`);
    } catch (e) {
      log(`[ERROR] Failed to kill external model PID ${ext.pid}: ${e.message}`);
    }
  }
});

function scanModels() {
  let files = [];
  try {
    files = fs.readdirSync(MODEL_DIR)
      .filter(f => f.toLowerCase().endsWith('.gguf'))
      .map(f => ({
        filename: f,
        path: path.join(MODEL_DIR, f)
      }));
  } catch (e) {
    log(`[ERROR] scanModels: ${e.message}`);
    return [];
  }
  return files;
}

const net = require('net');

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false)) // port is in use
      .once('listening', () => {
        tester.close();
        resolve(true); // port is free
      })
      .listen(port, '127.0.0.1');
  });
}

function getRunningModels() {
  const arr = [];
  for (const [pid, { modelPath, port }] of modelProcesses.entries()) {
    arr.push({
      pid,
      modelPath,
      port,
      filename: path.basename(modelPath),
      external: false,
    });
  }
  // Add external models
  const externals = getExternalModels();
  arr.push(...externals);
  return arr;
}

async function launchModel(modelPath, port) {
  const serverPath = '/Applications/LlamaCPP/llama-server';
  if (!fs.existsSync(serverPath)) {
    throw new Error('llama-server binary not found in app directory.');
  }

  // Check if port is available
  const available = await isPortAvailable(port);
  if (!available) {
    throw new Error(`Port ${port} is already in use.`);
  }

  // Spawn llama-server detached using nohup
  const args = ['-m', modelPath, '--port', port];
  const proc = spawn('nohup', [serverPath, ...args], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  });

  proc.unref(); // Let Node/Electron forget about it
  console.log(`[PROCESS] Model launched (detached): pid=${proc.pid}, model="${path.basename(modelPath)}", port=${port}`);

  // Track internally if you want
  modelProcesses.set(proc.pid, { proc: null, modelPath, port }); // proc=null because Node won't track it
  return { pid: proc.pid, modelPath, port };
}

function stopModel(pid) {
  return new Promise((resolve) => {
    let info = modelProcesses.get(pid);
    let isExternal = false;

    if (!info) {
      // Check external processes
      const externals = getExternalModels();
      info = externals.find(m => m.pid === pid);
      if (!info) return resolve(false); // PID not found
      isExternal = true;
    }

    try {
      // Always kill by PID, never the ChildProcess object
      process.kill(pid, 'SIGTERM');
      log(`[PROCESS] Sent SIGTERM to pid=${pid}, model="${info.modelPath ? path.basename(info.modelPath) : info.filename || 'Unknown'}"`);

      if (!isExternal && info.proc) {
        // Wait for exit event
        info.proc.once('exit', () => {
          modelProcesses.delete(pid);
          resolve(true);
        });
      } else {
        // External: poll until process is gone
        const interval = setInterval(() => {
          try {
            process.kill(pid, 0); // throws if not alive
          } catch (e) {
            clearInterval(interval);
            resolve(true);
          }
        }, 100);
      }
    } catch (e) {
      log(`[ERROR] stopModel: ${e.message}`);
      resolve(false);
    }
  });
}

function stopAllModels() {
  for (const [pid, info] of modelProcesses.entries()) {
    try {
      process.kill(pid, 'SIGTERM');
      log(`[PROCESS] stop-all: Sent SIGTERM to pid=${pid}, model="${path.basename(info.modelPath)}"`);
    } catch (e) { }
    modelProcesses.delete(pid);
  }
}

ipcMain.handle('scan-models', async () => {
  log('[IPC] scan-models called');
  const models = scanModels();
  log(`[IPC] scan-models success: found ${models.length} GGUF files`);
  return models;
});

ipcMain.handle('get-running-models', async () => {
  log('[IPC] get-running-models called');
  const arr = getRunningModels();
  log(`[IPC] get-running-models success: ${arr.length} running`);
  return arr;
});

ipcMain.handle('check-port', async (event, port) => {
  log(`[IPC] check-port called with port=${port}`);
  const available = isPortAvailable(port);
  log(`[IPC] check-port: port ${port} ${available ? 'available' : 'in use'}`);
  return available;
});

ipcMain.handle('launch-model', async (event, { modelPath, port }) => {
  log(`[IPC] launch-model called with modelPath="${modelPath}", port=${port}`);
  try {
    const result = launchModel(modelPath, port);
    log(`[IPC] launch-model success: model="${path.basename(modelPath)}", port=${port}, pid=${result.pid}`);
    return { success: true, ...result };
  } catch (e) {
    log(`[IPC] launch-model error: ${e.message}`);
    throw e;
  }
});

ipcMain.handle('stop-model', async (event, pid) => {
  log(`[IPC] stop-model called with pid=${pid}`);
  const info = modelProcesses.get(pid);
  const ok = stopModel(pid);
  log(`[IPC] stop-model success: pid=${pid}, model="${info ? path.basename(info.modelPath) : '?'}"`);
  return ok;
});

ipcMain.handle('stop-all-models', async () => {
  log(`[IPC] stop-all-models called`);
  stopAllModels();
  log(`[IPC] stop-all-models success`);
  return true;
});
