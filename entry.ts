import 'vditor/dist/index.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'cropperjs/dist/cropper.css';
import './css/styles.css';

import './js/jquery-global.ts';
import './js/tauri-bridge.ts';
import './js/native-file.ts';
import 'jstree/dist/themes/default/style.min.css';
import 'jstree';

import Vditor from 'vditor';

window.Vditor = Vditor;


import './js/translations.ts';
import './js/utils.ts';
import './js/auth.ts';
import './js/wasm-text-engine-gateway.ts';
import './js/files/index.ts';
import './js/indexedDB.ts';
import './js/resourceLoader.ts';
import './js/resourceRenderer.ts';
import './js/localImageManager.ts';
import './js/version-check.ts';
import './js/draftRecovery.ts';
import './js/appLifecycle.ts';

// UI Modules
import './js/ui/dialog.ts';
import './js/ui/common.ts';
import './js/ui/render.ts';
// 图表模块改为懒加载，不在首屏加载
// import './js/ui/chart.ts';
import './js/ui/echarts-loader.ts';
// 导出模块改为懒加载，不在首屏加载
// import './js/ui/export.ts';
import './js/ui/upload.ts';
import './js/ui/image-inline-tools.ts';
import './js/ui/image-compressor.ts';
// 分享模块改为懒加载，不在首屏加载
// import './js/ui/share.ts';
// 云打印模块改为懒加载，不在首屏加载
// import './js/ui/print.ts';
// AI 助手模块改为懒加载，不在首屏加载
// import './js/ui/ai.ts';
// import './js/ui/ai-assistant.ts';
// PPT生成器改为懒加载，不在首屏加载
// import './js/ui/ppt-generator.ts';
import './js/ui/file-manager.ts';

// 以下模块改为懒加载，不在首屏加载
// import './js/emoji-picker.ts';
// import './js/formula-picker.ts';
// import './js/uncertainty-calculator.ts';
import './js/ui/insert-picker.ts';

// 代码运行器模块改为懒加载，不在首屏加载
// import './js/code-runner.ts';

import './js/main.ts';
