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
