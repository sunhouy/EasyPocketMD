/**
 * 编辑器引擎切换层
 * - 支持 'vditor'（默认） / 'prosemirror'（实验）
 * - 用户在设置面板中切换，存储到 localStorage，切换后需刷新生效
 */

const STORAGE_KEY = 'editor_engine';
const DEFAULT_ENGINE = 'vditor';
const SUPPORTED_ENGINES = ['vditor', 'prosemirror'];

export function getCurrentEngine() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v && SUPPORTED_ENGINES.indexOf(v) >= 0) return v;
    } catch (_) { /* ignore */ }
    return DEFAULT_ENGINE;
}

export function setCurrentEngine(name) {
    if (SUPPORTED_ENGINES.indexOf(name) < 0) return false;
    try {
        if (name === DEFAULT_ENGINE) {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            localStorage.setItem(STORAGE_KEY, name);
        }
        return true;
    } catch (_) { return false; }
}

/**
 * 创建对应引擎的编辑器实例。
 * @param {'vditor'|'prosemirror'} engine
 * @param {string} elId  容器元素 id（与 Vditor 一致：'vditor'）
 * @param {object} vditorConfig  完整 Vditor 配置；ProseMirror 引擎仅取其中少数字段
 * @returns Vditor 实例或 EasyProseMirrorEditor 实例（均赋给 window.vditor）
 */
export async function createEditor(engine, elId, vditorConfig) {
    if (engine === 'prosemirror') {
        const [{ EasyProseMirrorEditor }] = await Promise.all([
            import('../src/prosemirror/index.ts'),
            import('../src/prosemirror/styles.css')
        ]);
        return new EasyProseMirrorEditor(elId, {
            value: vditorConfig && vditorConfig.value ? vditorConfig.value : '',
            theme: window.nightMode ? 'dark' : 'classic',
            placeholder: vditorConfig && vditorConfig.placeholder,
            after: vditorConfig && vditorConfig.after,
            input: vditorConfig && vditorConfig.input
        });
    }
    // 默认走 Vditor
    return new Vditor(elId, vditorConfig);
}

export const ENGINES = SUPPORTED_ENGINES;
