const { contextBridge, ipcRenderer } = require('electron');

function bindIpcEvent(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const wrapped = (event, ...args) => callback(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  saveLocalFile: (name, content) => ipcRenderer.invoke('save-local-file', { name, content }),
  getLocalFilePath: (name) => ipcRenderer.invoke('get-local-file-path', name),
  openLocalFileDialog: () => ipcRenderer.invoke('open-local-file-dialog'),
  readLocalFile: (filePath) => ipcRenderer.invoke('read-local-file', filePath),
  writeLocalFile: (filePath, content) => ipcRenderer.invoke('write-local-file', { path: filePath, content }),
  getMdAssociationEnabled: () => ipcRenderer.invoke('get-md-association-enabled'),
  setMdAssociationEnabled: (enabled) => ipcRenderer.invoke('set-md-association-enabled', enabled),
  onOpenLocalFileRequest: (callback) => bindIpcEvent('open-local-file-request', callback),
  ipcRenderer: {
    on: (channel, callback) => bindIpcEvent(channel, callback),
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
  }
});
