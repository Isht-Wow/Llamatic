window.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scanBtn');
  const modelsList = document.getElementById('modelsList');
  const runningTable = document.getElementById('runningTable');
  const runningTbody = runningTable.querySelector('tbody');
  const refreshRunningBtn = document.getElementById('refreshRunningBtn');
  const stopAllBtn = document.getElementById('stopAllBtn');

  function logAction(msg) {
    console.log(`[Renderer] ${msg}`);
  }

  function setModelsLoading(msg) {
    modelsList.innerHTML = `<li class="loading">${msg}</li>`;
  }

  function setRunningLoading(msg) {
    runningTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:8px;">${msg}</td></tr>`;
  }

  async function scanModels() {
    const resp = await fetch('/api/models');
    if (!resp.ok) throw new Error('Failed to fetch models');
    return await resp.json();
  }

  async function getRunningModels() {
    const resp = await fetch('/api/running');
    if (!resp.ok) throw new Error('Failed to fetch running models');
    return await resp.json();
  }

  async function launchModel(modelPath, port, host) {
    let url = `/api/launch?model=${encodeURIComponent(modelPath)}&port=${encodeURIComponent(port)}`;
    if (host) url += `&host=${encodeURIComponent(host)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Llamatic Error: Failed to launch');
    }
    return await resp.json();
  }

  async function stopModel(pid) {
    const url = `/api/stop?pid=${encodeURIComponent(pid)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Llamatic Error: Failed to stop model');
    return await resp.json();
  }

  async function updateModelsList() {
    setModelsLoading('Scanning for GGUF models...');
    logAction('Scanning for GGUF models...');
    try {
      const models = await scanModels();
      renderModels(models);
    } catch (e) {
      logAction(`[ERROR] Error scanning models: ${e.message}`);
      setModelsLoading('Error scanning models: ' + e.message);
    }
  }

  async function updateRunningModels() {
    setRunningLoading('Loading running models...');
    logAction('Loading running models...');
    try {
      const running = await getRunningModels();
      renderRunning(running);
    } catch (e) {
      logAction(`[ERROR] Error loading running models: ${e.message}`);
      setRunningLoading('Error loading running models: ' + e.message);
    }
  }

  function renderModels(models) {
    if (!models || models.length === 0) {
      setModelsLoading('No GGUF models found.');
      return;
    }
    modelsList.innerHTML = '';
    for (const m of models) {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="model-info">${m.filename}</span>
        <select class="host-select" style="padding:8px; border-radius:6px; background:#1e293b; color:white; border:1px solid #334155; margin-right:8px;">
            <option value="127.0.0.1">Local</option>
            <option value="0.0.0.0">Public</option>
        </select>
        <input type="number" min="1" max="65535" class="port-input" placeholder="Port" />
        <button class="launch-btn">Launch</button>
      `;
      const portInput = li.querySelector('.port-input');
      const hostSelect = li.querySelector('.host-select');
      const launchBtn = li.querySelector('.launch-btn');

      launchBtn.addEventListener('click', async () => {
        const port = Number(portInput.value);
        const host = hostSelect.value;
        if (!port || port < 1 || port > 65535) {
          alert('Llamatic Error: Enter a valid port (1-65535).');
          portInput.focus();
          portInput.style.border = '2px solid #dc2626';
          setTimeout(() => { portInput.style.border = ''; }, 1500);
          logAction(`Invalid port input for ${m.filename}: ${portInput.value}`);
          return;
        }
        launchBtn.disabled = true;
        launchBtn.textContent = 'Launching...';
        logAction(`Launching model "${m.filename}" on ${host}:${port}`);
        try {
          // Instead of checkPort, just try to launch and handle error if port is in use
          await launchModel(m.path, port, host);
          logAction(`Successfully launched "${m.filename}" on ${host}:${port}`);
          await updateRunningModels();
        } catch (e) {
          alert('Llamatic Error: ' + e.message);
          logAction(`[ERROR] Failed to launch "${m.filename}": ${e.message}`);
        } finally {
          launchBtn.disabled = false;
          launchBtn.textContent = 'Launch';
        }
      });

      modelsList.appendChild(li);
    }
  }

  function renderRunning(running) {
    if (!running || running.length === 0) {
      setRunningLoading('No models running');
      return;
    }
    runningTbody.innerHTML = '';
    for (const r of running) {
      const tr = document.createElement('tr');
      // Port input instead of static text
      // Actions: Restart (if port changed or just restart), Stop

      // Default to what the server reports, or 127.0.0.1
      const requestHost = r.host || '127.0.0.1';
      const isPublic = requestHost === '0.0.0.0';
      const isLocal = requestHost === '127.0.0.1';

      tr.innerHTML = `
        <td>${r.pid}</td>
        <td class="model-info">${r.filename}</td>
        <td>
            <select class="host-select" data-original="${requestHost}" style="padding:6px; border-radius:6px; background:#1e293b; color:white; border:1px solid #334155;">
                <option value="127.0.0.1" ${isLocal ? 'selected' : ''}>Local</option>
                <option value="0.0.0.0" ${isPublic ? 'selected' : ''}>Public</option>
            </select>
        </td>
        <td>
            <input type="number" class="port-input" value="${r.port}" min="1" max="65535" data-original="${r.port}">
        </td>
        <td>${r.ramMB ? Math.round(r.ramMB) + ' MB' : 'N/A'}</td>
        <td style="display:flex; gap:8px;">
          <button class="restart-btn" style="padding:6px 10px; font-size:0.85rem;" title="Restart with new port">↻</button>
          <button class="stop-btn danger" style="padding:6px 10px; font-size:0.85rem;">Stop</button>
        </td>
      `;

      const portInput = tr.querySelector('.port-input');
      const hostSelect = tr.querySelector('.host-select');
      const restartBtn = tr.querySelector('.restart-btn');
      const stopBtn = tr.querySelector('.stop-btn');

      // Restart Logic
      restartBtn.addEventListener('click', async () => {
        const newPort = Number(portInput.value);
        const newHost = hostSelect.value;
        const originalPort = Number(portInput.dataset.original);

        if (!newPort || newPort < 1 || newPort > 65535) {
          alert("Invalid port");
          return;
        }

        if (!r.modelPath) {
          alert("Cannot restart this model (path unknown). Stop and launch manually.");
          return;
        }

        // Visual feedback
        restartBtn.disabled = true;
        stopBtn.disabled = true;
        restartBtn.textContent = '...';
        hostSelect.disabled = true;
        portInput.disabled = true;

        try {
          logAction(`Restarting PID ${r.pid} on ${newHost}:${newPort}...`);

          // 1. Stop
          await stopModel(r.pid);

          // 2. Launch with Retry logic
          let retries = 5;
          while (retries > 0) {
            try {
              // Small delay to ensure OS releases port
              await new Promise(res => setTimeout(res, 1000));
              await launchModel(r.modelPath, newPort, newHost);
              break; // Success
            } catch (err) {
              // If it's a port conflict, we retry. 
              // Note: The server returns 400 "Port in use" json error which becomes error message.
              if ((err.message.includes('Port in use') || err.message.includes('Address already in use')) && retries > 1) {
                logAction(`Port ${newPort} still in use, retrying... (${retries} left)`);
                retries--;
                continue;
              }
              throw err; // Rethrow other errors or final failure
            }
          }

          logAction(`Restarted ${r.filename} on ${newHost}:${newPort}`);
          await updateRunningModels();

        } catch (e) {
          alert('Failed to restart: ' + e.message);
          // Refresh to show true state
          await updateRunningModels();
        }
      });

      // Stop Logic
      stopBtn.addEventListener('click', async () => {
        stopBtn.disabled = true;
        stopBtn.textContent = '...';
        logAction(`Stopping model PID ${r.pid} (${r.filename})`);
        try {
          await stopModel(r.pid);
          logAction(`Stopped model PID ${r.pid} (${r.filename})`);
          await updateRunningModels();
        } catch (e) {
          alert('Llamatic Error: ' + e.message);
          logAction(`[ERROR] Failed to stop PID ${r.pid}: ${e.message}`);
        } finally {
          // If row still exists (error case)
          stopBtn.disabled = false;
          stopBtn.textContent = 'Stop';
        }
      });
      runningTbody.appendChild(tr);
    }
  }

  scanBtn.addEventListener('click', updateModelsList);
  refreshRunningBtn.addEventListener('click', updateRunningModels);
  stopAllBtn.addEventListener('click', async () => {
    if (!confirm('Stop all running models?')) return;
    stopAllBtn.disabled = true;
    stopAllBtn.textContent = 'Stopping...';
    logAction('Stopping all models');
    try {
      // Get running models, stop each
      const running = await getRunningModels();
      for (const r of running) {
        try { await stopModel(r.pid); } catch { }
      }
      logAction('All models stopped');
      await updateRunningModels();
    } catch (e) {
      alert('Llamatic Error: ' + e.message);
      logAction(`[ERROR] Failed to stop all models: ${e.message}`);
    } finally {
      stopAllBtn.disabled = false;
      stopAllBtn.textContent = 'Stop All Models';
    }
  });

  // Heartbeat to keep server alive
  setInterval(() => fetch('/ping').catch(() => { }), 5000);

  // Initial load
  logAction('Initial load: updating models and running models lists');
  updateModelsList();
  updateRunningModels();

  // Settings panel logic
  const bindToggle = document.getElementById('bindToggle');
  const modelDirPicker = document.getElementById('modelDirPicker');
  const modelDirInput = document.getElementById('modelDirInput');
  const llamaFilePicker = document.getElementById('llamaFilePicker');
  const llamaPathInput = document.getElementById('llamaPathInput');
  const saveConfigBtn = document.getElementById('saveConfigBtn');

  // Load current settings
  async function loadConfig() {
    try {
      const resp = await fetch('/api/config');
      if (!resp.ok) return;
      const settings = await resp.json();

      bindToggle.checked = settings.bind === '0.0.0.0';
      modelDirInput.value = settings.modelDir;
      llamaPathInput.value = settings.llamaServer || '';
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  // GGUF folder picker
  modelDirPicker.addEventListener('change', async () => {
    if (!modelDirPicker.files.length) return;
    const f = modelDirPicker.files[0];

    // Electron or similar environment with full path access
    if (f.path) {
      // If it's a directory selection (webkitdirectory), f.path IS the directory path (usually)
      // or the path of the first file.
      // If webkitdirectory is used, files contains all files.
      // f.path for a file in a directory usually looks like /path/to/dir/file.
      // We want the directory.
      const sep = f.path.includes('\\') ? '\\' : '/';
      const folder = f.path.substring(0, f.path.lastIndexOf(sep));
      modelDirInput.value = folder;
    } else {
      // Browser environment: cannot get full path.
      alert('Browser security prevents detecting the full path. Please paste the absolute path in the text box.');
      modelDirInput.focus();
    }
  });


  llamaFilePicker.addEventListener('change', () => {
    if (!llamaFilePicker.files.length) return;
    const f = llamaFilePicker.files[0];
    if (f.path) {
      llamaPathInput.value = f.path;
    } else {
      alert('Browser security prevents detecting the full file path. Please paste the absolute path to llama-server in the text box.');
      llamaPathInput.focus();
    }
  });

  // Save & Restart
  saveConfigBtn.addEventListener('click', async () => {
    const payload = {
      bind: bindToggle.checked ? '0.0.0.0' : '127.0.0.1',
      modelDir: modelDirInput.value.trim(),
      llamaServer: llamaPathInput.value.trim()
    };

    if (!payload.modelDir) {
      alert("Please enter a valid Model Directory path.");
      return;
    }

    if (!payload.llamaServer) {
      alert("Please enter a valid Llama Server path.");
      return;
    }

    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Settings saved. If you changed the Bind Address, please restart the server manually.');
      window.location.reload();
    } catch (e) {
      alert('Failed to save settings: ' + e.message);
    }
  });

  // Load config on start
  loadConfig();
});