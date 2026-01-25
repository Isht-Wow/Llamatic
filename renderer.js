

window.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scanBtn');
  const modelsList = document.getElementById('modelsList');
  const runningList = document.getElementById('runningList');
  const refreshRunningBtn = document.getElementById('refreshRunningBtn');
  const stopAllBtn = document.getElementById('stopAllBtn');

  const llamaAPI = window.llamaAPI;

  if (!llamaAPI) {
    console.error('[Renderer][ERROR] llamaAPI not available. Preload not loaded correctly.');
    modelsList.innerHTML = '<li class="loading">Electron API not available!</li>';
    runningList.innerHTML = '<li class="loading">Electron API not available!</li>';
    return;
  }

  function logAction(msg) {
    console.log(`[Renderer] ${msg}`);
  }

  function setModelsLoading(msg) {
    modelsList.innerHTML = `<li class="loading">${msg}</li>`;
  }

  function setRunningLoading(msg) {
    runningList.innerHTML = `<li class="loading">${msg}</li>`;
  }

  async function updateModelsList() {
    setModelsLoading('Scanning for GGUF models...');
    logAction('Scanning for GGUF models...');
    try {
      const models = await llamaAPI.scanModels();
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
      const running = await llamaAPI.getRunningModels();
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
        <input type="number" min="1" max="65535" class="port-input" placeholder="Port" />
        <button class="launch-btn">Launch</button>
      `;
      const portInput = li.querySelector('.port-input');
      const launchBtn = li.querySelector('.launch-btn');

      launchBtn.addEventListener('click', async () => {
        const port = Number(portInput.value);
        if (!port || port < 1 || port > 65535) {
          alert('Enter a valid port (1-65535).');
          portInput.focus();
          portInput.style.border = '2px solid #dc2626';
          setTimeout(() => { portInput.style.border = ''; }, 1500);
          logAction(`Invalid port input for ${m.filename}: ${portInput.value}`);
          return;
        }
        launchBtn.disabled = true;
        launchBtn.textContent = 'Launching...';
        logAction(`Launching model "${m.filename}" on port ${port}`);
        try {
          const available = await llamaAPI.checkPort(port);
          if (!available) {
            alert(`Port ${port} is already in use.`);
            logAction(`Port ${port} already in use for ${m.filename}`);
            return;
          }
          await llamaAPI.launchModel(m.path, port);
          logAction(`Successfully launched "${m.filename}" on port ${port}`);
          await updateRunningModels();
        } catch (e) {
          alert('Failed to launch model: ' + e.message);
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
    runningList.innerHTML = '';
    for (const r of running) {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="model-info">
          <b>${r.filename}</b> &mdash; PID: ${r.pid}, Port: ${r.port}
        </span>
        <button class="stop-btn danger">Stop</button>
      `;
      const stopBtn = li.querySelector('.stop-btn');
      stopBtn.addEventListener('click', async () => {
        stopBtn.disabled = true;
        stopBtn.textContent = 'Stopping...';
        logAction(`Stopping model PID ${r.pid} (${r.filename})`);
        try {
          await llamaAPI.stopModel(r.pid);
          logAction(`Stopped model PID ${r.pid} (${r.filename})`);
          await updateRunningModels();
        } catch (e) {
          alert('Failed to stop model: ' + e.message);
          logAction(`[ERROR] Failed to stop PID ${r.pid}: ${e.message}`);
        } finally {
          stopBtn.disabled = false;
          stopBtn.textContent = 'Stop';
        }
      });
      runningList.appendChild(li);
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
      await llamaAPI.stopAllModels();
      logAction('All models stopped');
      await updateRunningModels();
    } catch (e) {
      alert('Failed to stop all models: ' + e.message);
      logAction(`[ERROR] Failed to stop all models: ${e.message}`);
    } finally {
      stopAllBtn.disabled = false;
      stopAllBtn.textContent = 'Stop All Models';
    }
  });

  llamaAPI.onModelStopped(async (pid) => {
    logAction(`Model stopped event received for PID ${pid}`);
    await updateRunningModels();
  });

  // Initial load
  logAction('Initial load: updating models and running models lists');
  updateModelsList();
  updateRunningModels();
});