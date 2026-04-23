/**
 * 测试环境初始化脚本
 * 在所有测试套件运行前执行，负责：
 * 1. 导入 @testing-library/jest-dom 提供更好的断言支持
 * 2. 初始化所有 window.* 全局变量，确保与 legacy.d.ts 类型定义一致
 */
/// <reference path="../src/types/legacy.d.ts" />

import '@testing-library/jest-dom';

window.vditor = null;
window.vditorReady = false;
window.vditorInitPromise = null;
window.currentUser = null;
window.files = [];
window.currentFileId = null;
window.tauriBridge = null;
window.wasmTextEngineGateway = null;
window._legacyEditorConfig = null;
window.nightMode = false;
window.unsavedChanges = {};
window.userSettings = {};
window.pendingServerSync = false;
window.isFileSwitchLoading = false;
window.autoSaveTimer = null;
window.syncInterval = null;
window.lastSyncedContent = {};
window.startInFileManagementMode = false;
window.deferInitialFileOpen = false;
window.isFileManagementMode = false;
window.isTauriMobileEnvironment = false;
window.toolbarUncertaintyUnlocked = false;
window.enterFileManagementMode = jest.fn();
window.enterEditorMode = jest.fn();
window.ensureWasmTextEngineReady = jest.fn().mockResolvedValue(null);
window.ensureVditorInitialized = jest.fn().mockResolvedValue(null);
window.onInitialFileListRendered = jest.fn();
window.showSettingsDialog = jest.fn();
window.showAboutDialog = jest.fn();
window.showServiceStatusDialog = jest.fn();
window.renderBottomToolbar = jest.fn();
window.__resolveVditorInit = null;
window.__rejectVditorInit = null;
window.wasmTextEngineReadyPromise = null;
window._hmt = [];