import '@sunhouyun/vditor/dist/index.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'cropperjs/dist/cropper.css';
import './css/styles.css';

import './js/jquery-global';
import './js/tauri-bridge';
import './js/native-file';
import 'jstree/dist/themes/default/style.min.css';
import 'jstree';

import Vditor from '@sunhouyun/vditor';

window.Vditor = Vditor;


import './js/translations';
import './js/utils';
import './js/auth';
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
import './js/ui/file-manager';

// 以下模块改为懒加载，不在首屏加载
// import './js/emoji-picker';
// import './js/formula-picker';
import './js/ui/insert-picker';

// 代码运行器：轻量 loader 在编辑器就绪后加载，完整模块在用户悬停/点击代码块时加载
// import './js/code-runner';

import './js/main';
