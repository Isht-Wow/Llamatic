

const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API in the renderer
contextBridge.exposeInMainWorld('llamaAPI', {
  scanModels: async () => {
    return await ipcRenderer.invoke('scan-models');
  },
  getRunningModels: async () => {
    return await ipcRenderer.invoke('get-running-models');
  },
  checkPort: async (port) => {
    return await ipcRenderer.invoke('check-port', port);
  },
  launchModel: async (modelPath, port) => {
    // Always require both modelPath and port
    if (!modelPath || !port) throw new Error('Model path and port required.');
    return await ipcRenderer.invoke('launch-model', { modelPath, port });
  },
  stopModel: async (pid) => {
    return await ipcRenderer.invoke('stop-model', pid);
  },
  stopAllModels: async () => {
    return await ipcRenderer.invoke('stop-all-models');
  },
  // Subscribe to model-stopped event
  onModelStopped: (cb) => {
    ipcRenderer.on('model-stopped', (event, pid) => cb(pid));
  }
});