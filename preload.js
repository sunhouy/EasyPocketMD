const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  saveLocalFile: (name, content) => ipcRenderer.invoke('save-local-file', { name, content }),
  getLocalFilePath: (name) => ipcRenderer.invoke('get-local-file-path', name)
});
