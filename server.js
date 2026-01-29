const os = require('os');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync, exec } = require('child_process');
const net = require('net');

const SETTINGS_PATH = path.join(__dirname, 'settings.json');

// Default settings
let settings = {
  bind: '127.0.0.1',           // public/private
  modelDir: path.join(os.homedir(), 'Downloads'),  // default GGUF folder
  llamaServer: 'internal'      // 'internal' or path to custom binary
};

// Internal binary path construction
function getInternalLlamaServerPath() {
  // bin/platform/arch/llama-server
  // e.g. bin/darwin/arm64/llama-server
  return path.join(__dirname, 'bin', os.platform(), os.arch(), 'llama-server');
}

// Load settings from JSON file
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
      const parsed = JSON.parse(data);
      settings = { ...settings, ...parsed };
      console.log('Settings loaded:', settings);
    } else {
      console.log('No settings.json found, using defaults.');
    }
  } catch (err) {
    console.error('Failed to load settings.json, using defaults.', err);
  }
}

// Save current settings to JSON file
function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
    console.log('Settings saved:', settings);
  } catch (err) {
    console.error('Failed to save settings.json:', err);
  }
}

// Load settings at startup
loadSettings();

const PORT = 11313;
const PUBLIC_DIR = path.join(__dirname, 'public');

let modelProcesses = new Map();
let lastPing = Date.now();

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

function isPortAvailable(port) {
  return new Promise(resolve => {
    const s = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => s.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

function getExternalModels() {
  const out = [];
  try {
    const ps = execSync('ps -axo pid=,command=', { encoding: 'utf8' });
    for (const line of ps.split('\n')) {
      if (!line.includes('llama-server')) continue;
      const pid = Number(line.trim().split(' ')[0]);
      if (modelProcesses.has(pid)) continue;
      const portMatch = line.match(/--port\s+(\d+)/);
      const hostMatch = line.match(/--host\s+(\S+)/);
      // Match everything until .gguf (including spaces)
      const modelMatch = line.match(/([^\n]+\.gguf)/);
      if (pid && portMatch && modelMatch) {
        out.push({
          pid,
          port: Number(portMatch[1]),
          host: hostMatch ? hostMatch[1] : '127.0.0.1', // default if not found
          filename: path.basename(modelMatch[1]),
          fullpath: modelMatch[1]
        });
      }
    }
  } catch { }
  return out;
}

const server = http.createServer(async (req, res) => {
  // CORS for local dev flex
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/ping') {
    lastPing = Date.now();
    return send(res, 200, { ok: true });
  }

  // --- CONFIG API ---
  if (req.url === '/api/config') {
    if (req.method === 'GET') {
      return send(res, 200, settings);
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const newSettings = JSON.parse(body);
          // Validate and merge
          if (typeof newSettings.bind === 'string') settings.bind = newSettings.bind;
          if (typeof newSettings.modelDir === 'string') settings.modelDir = newSettings.modelDir;
          if (typeof newSettings.llamaServer === 'string') settings.llamaServer = newSettings.llamaServer;

          saveSettings();
          send(res, 200, { ok: true, settings });
          // Note: Bind address change requires restart, handled by client alert usually
        } catch (e) {
          send(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }
  }

  if (req.url === '/api/models') {
    const searchDir = settings.modelDir;
    if (!fs.existsSync(searchDir)) {
      return send(res, 200, []);
    }

    try {
      const models = fs.readdirSync(searchDir)
        .filter(f => f.endsWith('.gguf'))
        .map(f => ({ filename: f, path: path.join(searchDir, f) }));
      return send(res, 200, models);
    } catch (e) {
      console.error('Error reading model dir:', e);
      return send(res, 500, { error: 'Failed to read model directory' });
    }
  }

  if (req.url === '/api/running') {
    function getRamUsageMB(pid) {
      const platform = os.platform();
      if (platform === 'win32') {
        try {
          const output = execSync(
            `wmic process where processid=${pid} get WorkingSetSize /format:list`,
            { encoding: 'utf8' }
          );
          const memMatch = output.match(/WorkingSetSize=(\d+)/);
          if (memMatch) {
            const bytes = parseInt(memMatch[1], 10);
            return bytes / 1024 / 1024; // Convert bytes to MB
          }
          return 0;
        } catch {
          return 0;
        }
      } else {
        try {
          const output = execSync(`ps -p ${pid} -o rss=`, { encoding: 'utf8' });
          const rssKB = parseInt(output.trim(), 10);
          return rssKB / 1024; // Convert KB to MB
        } catch {
          return 0;
        }
      }
    }

    const internal = [...modelProcesses.entries()].map(([pid, m]) => {
      const ramMB = getRamUsageMB(pid);
      return {
        pid,
        port: m.port,
        host: m.host || '127.0.0.1',
        filename: path.basename(m.model),
        modelPath: m.model,
        ramMB: ramMB
      };
    });

    const external = getExternalModels().map(e => {
      const ramMB = getRamUsageMB(e.pid);
      return {
        pid: e.pid,
        port: e.port,
        host: e.host || '127.0.0.1', // getExternalModels needs update to fetch host
        filename: e.filename,
        // For external models, we might not have the full path easily from `ps` command 
        // depending on how it was launched, but `getExternalModels` regex might catch it.
        // Let's check getExternalModels implementation.
        // It captures `([^\n]+\.gguf)`. This is usually the full command argument.
        // If the user ran `llama-server -m ./model.gguf`, it's relative.
        // If absolute, it's absolute. Use specific logic if needed, but for now let's try to pass it.
        // Actually, getExternalModels returns { filename: path.basename(modelMatch[1]) }.
        // We should update getExternalModels to return full path too.
        modelPath: e.fullpath,
        ramMB: ramMB
      };
    });

    return send(res, 200, internal.concat(external));
  }

  if (req.url.startsWith('/api/launch')) {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    const model = u.searchParams.get('model');
    const port = Number(u.searchParams.get('port'));

    if (!model || !port) return send(res, 400, { error: 'Missing model or port' });
    if (!(await isPortAvailable(port))) return send(res, 400, { error: 'Port in use' });

    // Determine llama-server binary
    let serverPath = settings.llamaServer;
    if (serverPath === 'internal') {
      serverPath = getInternalLlamaServerPath();
    }

    if (!fs.existsSync(serverPath)) {
      return send(res, 500, { error: `Llama server binary not found at: ${serverPath}` });
    }

    // Default host to settings.bind or 127.0.0.1
    const host = u.searchParams.get('host') || settings.bind || '127.0.0.1';

    console.log(`Launching: ${serverPath} -m ${model} --port ${port} --host ${host}`);

    const args = ['-m', model, '--port', port, '--host', host];
    const p = spawn(serverPath, args, {
      detached: false, stdio: 'ignore'
    });

    // Check if immediate error (e.g. bad binary)
    // Note: 'ignore' stdio makes it hard to catch startup errors, but detached helps.
    // Ideally we'd capture stderr for a bit. For now, rely on pid.

    p.unref();
    modelProcesses.set(p.pid, { model, port, host });
    return send(res, 200, { pid: p.pid });
  }

  if (req.url.startsWith('/api/stop')) {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    const pid = Number(u.searchParams.get('pid'));
    try { process.kill(pid); modelProcesses.delete(pid); } catch { }
    return send(res, 200, { ok: true });
  }

  let file = req.url === '/' ? 'index.html' : req.url.slice(1);
  const filePath = path.join(PUBLIC_DIR, file);
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');

  fs.readFile(filePath, (e, d) => {
    if (e) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, d, file.endsWith('.html') ? 'text/html' : 'text/plain');
  });
});

setInterval(() => {
  if (Date.now() - lastPing > 15000) {
    for (const pid of modelProcesses.keys()) {
      try { process.kill(pid); } catch { }
    }
    process.exit(0);
  }
}, 2000);

// Listen on configured bind address
const host = settings.bind || '127.0.0.1';
server.listen(PORT, host, () => {
  console.log(`Llamatic running at http://${host}:${PORT}`);
  exec(`open http://localhost:${PORT}`);
});