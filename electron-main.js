const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Handle local file saving
ipcMain.handle('save-local-file', async (event, { name, content }) => {
  const localDir = path.join(app.getPath('userData'), 'local_files');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  const filePath = path.join(localDir, name);
  // Content can be a buffer or a base64 string
  if (content.startsWith('data:')) {
    const base64Data = content.split(',')[1];
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  } else {
    fs.writeFileSync(filePath, content);
  }
  return `file://${filePath}`;
});

ipcMain.handle('get-local-file-path', async (event, name) => {
  const localDir = path.join(app.getPath('userData'), 'local_files');
  const filePath = path.join(localDir, name);
  return `file://${filePath}`;
});

// Create the main browser window and load the built web app (dist/index.html)
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true, // 隐藏顶部的默认菜单栏
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the local built index.html from dist
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  mainWindow.loadFile(indexPath);

  // Optional: open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detached' });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps often stay open until the user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

