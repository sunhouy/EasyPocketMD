import { loadFeature } from './js/feature-loader';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'cropperjs/dist/cropper.css';
import './css/styles.css';
import './css/material.css';
import { installMaterialInteractions } from './js/main/material-interactions';
installMaterialInteractions();

import './js/jquery-global';
import './js/tauri-bridge';
import './js/native-file';
// Editor and legacy tree dependencies are loaded after the file home is painted.


import './js/translations';
import './js/utils';
import './js/auth';
import './js/market-entry';
import './js/e2e-ui';
import './js/wasm-text-engine-gateway';
import './js/files/index.ts';
import './js/indexedDB';
import './js/resourceLoader';
import './js/resourceRenderer';
import './js/localImageManager';
import './js/version-check';
import './js/draftRecovery';
import './js/appLifecycle';

// UI Modules
import './js/ui/dialog';
import './js/ui/common';
import './js/ui/insert-dialogs';
import './js/ui/render';
// 图表模块改为懒加载，不在首屏加载
// import './js/ui/chart';
import './js/ui/echarts-loader';
// 导出模块改为懒加载，不在首屏加载
// import './js/ui/export';
import './js/ui/upload';
import './js/ui/image-inline-tools';
import './js/ui/image-compressor';
// 分享模块改为懒加载，不在首屏加载
// import './js/ui/share';
// 云打印模块改为懒加载，不在首屏加载
// import './js/ui/print';
// AI 助手模块改为懒加载，不在首屏加载
// import './js/ui/ai';
// import './js/ui/ai-assistant';
// PPT生成器改为懒加载，不在首屏加载
// import './js/ui/ppt-generator';
// Resource management and cross-document reference scanning are loaded on demand.
const loadFileManager = async () => {
    await loadFeature('ui/file-manager', () => import('./js/ui/file-manager'));
    const open = window.showFileManager;
    if (open === loadFileManager) throw new Error('File manager failed to initialize');
    await open();
};
window.showFileManager = loadFileManager;

// 以下模块改为懒加载，不在首屏加载
// import './js/emoji-picker';
// import './js/formula-picker';
import './js/ui/insert-picker';

// 代码运行器：轻量 loader 在编辑器就绪后加载，完整模块在用户悬停/点击代码块时加载
// import './js/code-runner';

import './js/main';

import './js/code-block-editor-loader';

// Feature preloading is scheduled by the file-home first-paint hook.
