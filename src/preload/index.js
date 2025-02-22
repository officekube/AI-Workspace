const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Add any functions you want to expose here
    getPythonVersion: () => ipcRenderer.invoke('get-python-version'),
    getNodeVersion: () => ipcRenderer.invoke('get-node-version'),
  }
);