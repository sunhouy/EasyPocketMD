const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = 'electron-settings.json';
let cachedSettings = null;
let pendingOpenFilePaths = [];

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function loadSettings() {
  if (cachedSettings) return cachedSettings;
  const defaults = { mdFileAssociationEnabled: true };
  try {
    const settingsPath = getSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      cachedSettings = defaults;
      return cachedSettings;
    }
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    cachedSettings = { ...defaults, ...parsed };
    return cachedSettings;
  } catch (error) {
    console.error('Failed to load electron settings:', error);
    cachedSettings = defaults;
    return cachedSettings;
  }
}

function saveSettings(nextSettings) {
  const merged = { ...loadSettings(), ...nextSettings };
  const settingsPath = getSettingsPath();
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8');
    cachedSettings = merged;
    return merged;
  } catch (error) {
    console.error('Failed to save electron settings:', error);
    return cachedSettings || merged;
  }
}

function getLocalDir() {
  const localDir = path.join(app.getPath('userData'), 'local_files');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return localDir;
}

function readTextFileSafe(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function queueOpenFilePath(filePath) {
  const settings = loadSettings();
  if (!settings.mdFileAssociationEnabled) return;
  if (!filePath || !fs.existsSync(filePath)) return;
  pendingOpenFilePaths.push(filePath);
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('open-local-file-request', filePath);
    pendingOpenFilePaths = [];
  }
}

function flushPendingOpenFiles() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents) return;
  if (pendingOpenFilePaths.length === 0) return;
  pendingOpenFilePaths.forEach((filePath) => {
    mainWindow.webContents.send('open-local-file-request', filePath);
  });
  pendingOpenFilePaths = [];
}

function extractOpenFilePathFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (!arg || typeof arg !== 'string') continue;
    if (arg.startsWith('--')) continue;
    if (arg.endsWith('electron-main.js')) continue;
    if (arg.endsWith('.asar')) continue;
    if (!fs.existsSync(arg)) continue;
    try {
      if (fs.statSync(arg).isFile()) {
        return path.resolve(arg);
      }
    } catch (error) {
      // Ignore invalid argv entries.
    }
  }
  return null;
}

// Handle local file saving
ipcMain.handle('save-local-file', async (event, { name, content }) => {
  const localDir = getLocalDir();
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
  const localDir = getLocalDir();
  const filePath = path.join(localDir, name);
  return `file://${filePath}`;
});

ipcMain.handle('open-local-file-dialog', async () => {
  const windowRef = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(windowRef, {
    title: 'Open Local Markdown File',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const targetPath = result.filePaths[0];
  const readResult = readTextFileSafe(targetPath);
  if (!readResult.success) {
    return { canceled: false, success: false, error: readResult.error };
  }

  return {
    canceled: false,
    success: true,
    path: targetPath,
    name: path.basename(targetPath),
    content: readResult.content
  };
});

ipcMain.handle('read-local-file', async (event, filePath) => {
  if (!filePath) return { success: false, error: 'Empty path' };
  if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' };
  const readResult = readTextFileSafe(filePath);
  if (!readResult.success) return readResult;
  return {
    success: true,
    path: filePath,
    name: path.basename(filePath),
    content: readResult.content
  };
});

ipcMain.handle('write-local-file', async (event, { path: filePath, content }) => {
  if (!filePath) return { success: false, error: 'Empty path' };
  try {
    fs.writeFileSync(filePath, content || '', 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-md-association-enabled', async () => {
  const settings = loadSettings();
  return !!settings.mdFileAssociationEnabled;
});

ipcMain.handle('set-md-association-enabled', async (event, enabled) => {
  const settings = saveSettings({ mdFileAssociationEnabled: !!enabled });
  return !!settings.mdFileAssociationEnabled;
});

// 保存草稿到本地文件系统（用于紧急备份）
ipcMain.handle('save-draft-backup', async (event, { fileId, fileName, content, timestamp }) => {
  const draftDir = path.join(app.getPath('userData'), 'drafts');
  if (!fs.existsSync(draftDir)) {
    fs.mkdirSync(draftDir, { recursive: true });
  }

  const draftPath = path.join(draftDir, `draft_${fileId}.json`);
  const draftData = {
    fileId,
    fileName,
    content,
    timestamp,
    savedAt: Date.now()
  };

  try {
    fs.writeFileSync(draftPath, JSON.stringify(draftData, null, 2));
    return { success: true, path: draftPath };
  } catch (e) {
    console.error('Failed to save draft backup:', e);
    return { success: false, error: e.message };
  }
});

// 读取草稿备份
ipcMain.handle('load-draft-backup', async (event, fileId) => {
  const draftDir = path.join(app.getPath('userData'), 'drafts');
  const draftPath = path.join(draftDir, `draft_${fileId}.json`);

  try {
    if (fs.existsSync(draftPath)) {
      const data = fs.readFileSync(draftPath, 'utf-8');
      return { success: true, draft: JSON.parse(data) };
    }
    return { success: false, error: 'Draft not found' };
  } catch (e) {
    console.error('Failed to load draft backup:', e);
    return { success: false, error: e.message };
  }
});

// 清理草稿备份
ipcMain.handle('clear-draft-backup', async (event, fileId) => {
  const draftDir = path.join(app.getPath('userData'), 'drafts');
  const draftPath = path.join(draftDir, `draft_${fileId}.json`);

  try {
    if (fs.existsSync(draftPath)) {
      fs.unlinkSync(draftPath);
    }
    return { success: true };
  } catch (e) {
    console.error('Failed to clear draft backup:', e);
    return { success: false, error: e.message };
  }
});

let mainWindow = null;
let isQuitting = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const externalPath = extractOpenFilePathFromArgv(argv);
    if (externalPath) {
      queueOpenFilePath(externalPath);
    }
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  queueOpenFilePath(filePath);
});

// Create the main browser window and load the built web app (dist/index.html)
function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.webContents.on('did-finish-load', () => {
    flushPendingOpenFiles();
  });

  // Optional: open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detached' });
  }

  // 处理窗口关闭事件
  mainWindow.on('close', async (event) => {
    if (!isQuitting) {
      event.preventDefault();

      // 通知渲染进程保存数据
      mainWindow.webContents.send('window-before-close');

      // 给渲染进程一些时间来保存数据
      setTimeout(() => {
        isQuitting = true;
        mainWindow.close();
      }, 500);

      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const startupPath = extractOpenFilePathFromArgv(process.argv.slice(1));
  if (startupPath) {
    queueOpenFilePath(startupPath);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 处理应用退出
app.on('before-quit', (event) => {
  if (!isQuitting && mainWindow) {
    event.preventDefault();

    // 通知渲染进程应用即将退出
    mainWindow.webContents.send('app-before-close');

    // 给渲染进程一些时间来保存数据
    setTimeout(() => {
      isQuitting = true;
      app.quit();
    }, 500);

    return false;
  }
});

app.on('window-all-closed', () => {
  // On macOS, apps often stay open until the user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
