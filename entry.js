import 'vditor/dist/index.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './css/styles.css';

import './js/jquery-global.js';
import 'jstree/dist/themes/default/style.min.css';
import 'jstree';

import Vditor from 'vditor';

window.Vditor = Vditor;


import './js/translations.js';
import './js/utils.js';
import './js/auth.js';
import './js/files.js';
import './js/indexedDB.js';
import './js/resourceLoader.js';
import './js/resourceRenderer.js';
import './js/localImageManager.js';
import './js/draftRecovery.js';
import './js/appLifecycle.js';

// UI Modules
import './js/ui/dialog.js';
import './js/ui/common.js';
import './js/ui/render.js';
// 图表模块改为懒加载，不在首屏加载
// import './js/ui/chart.js';
import './js/ui/echarts-loader.js';
// 导出模块改为懒加载，不在首屏加载
// import './js/ui/export.js';
import './js/ui/upload.js';
// 分享模块改为懒加载，不在首屏加载
// import './js/ui/share.js';
// 云打印模块改为懒加载，不在首屏加载
// import './js/ui/print.js';
// AI 助手模块改为懒加载，不在首屏加载
// import './js/ui/ai.js';
// import './js/ui/ai-assistant.js';
// PPT生成器改为懒加载，不在首屏加载
// import './js/ui/ppt-generator.js';
import './js/ui/file-manager.js';

// 以下模块改为懒加载，不在首屏加载
// import './js/emoji-picker.js';
// import './js/formula-picker.js';
// import './js/uncertainty-calculator.js';
import './js/ui/insert-picker.js';

import './js/main.js';
