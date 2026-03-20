const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true
});
