/**
 * EasyProseMirrorEditor
 *
 * 框架无关（非 React）的 ProseMirror Markdown 编辑器封装。
 * 对外暴露的方法尽量与 main 分支中 Vditor 的常用 API 保持一致，
 * 以便在 js/main.js 里通过 `window.vditor = new EasyProseMirrorEditor(...)`
 * 直接替换 Vditor，而无需大改外围的同步 / 保存 / 工具栏代码。
 */

import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { customParser, customSerializer } from './parser';
import { buildPlugins } from './plugins';
import { markdownSchema } from './schema';

export interface EasyProseMirrorOptions {
  /** 容器 id 或元素 */
  el?: string | HTMLElement;
  /** 初始值 */
  value?: string;
  /** 主题 'classic' | 'dark' */
  theme?: 'classic' | 'dark';
  /** 占位符 */
  placeholder?: string;
  /** ready 回调 (语义对齐 Vditor 的 after) */
  after?: () => void;
  /** 内容变更回调 */
  input?: (markdown: string) => void;
}

/**
 * 极简 Vditor-shaped 接口子集；只覆盖 main 分支大量使用的方法，
 * 其它不常用的 Vditor 专属方法（exportPDF 等）由调用方自行兜底。
 */
export class EasyProseMirrorEditor {
  /**
   * 与 Vditor 对齐：暴露内部细节。
   * 项目里的 `isVditorValueBridgeReady` 会检查 `vditor.vditor.lute.Md2VditorDOM`，
   * 这里提供同名 stub 以通过检测，实际 markdown→DOM 由 ProseMirror 自身完成。
   */
  public vditor: {
    ir: { element: HTMLElement };
    wysiwyg: { element: HTMLElement };
    sv: { element: HTMLElement };
    lute: { Md2VditorDOM: (md: string) => string };
    mode?: string;
  } | null = null;
  /** 编辑器引擎名称，用于业务逻辑判断 */
  public readonly engine = 'prosemirror' as const;

  private view: EditorView | null = null;
  private host: HTMLElement;
  private opts: EasyProseMirrorOptions;
  private suppressInput = false;
  private destroyed = false;

  constructor(elOrId: string | HTMLElement, options: EasyProseMirrorOptions = {}) {
    this.opts = options;

    const host = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!host) {
      throw new Error(`EasyProseMirrorEditor: host element not found for "${String(elOrId)}"`);
    }
    this.host = host;
    this.host.classList.add('easy-pm-host');
    if (options.theme === 'dark') this.host.classList.add('easy-pm-dark');

    this.mount(options.value ?? '');

    // 与 Vditor 的 after 回调时机对齐：稍微延迟一帧，等待 DOM 完成
    if (typeof options.after === 'function') {
      requestAnimationFrame(() => {
        if (!this.destroyed) options.after!();
      });
    }
  }

  private mount(initialMd: string) {
    // 清空容器（防止重复挂载）
    this.host.innerHTML = '';

    const editorEl = document.createElement('div');
    editorEl.className = 'easy-pm-editor';
    if (this.opts.placeholder) {
      editorEl.setAttribute('data-placeholder', this.opts.placeholder);
    }
    this.host.appendChild(editorEl);

    let doc;
    try {
      doc = customParser.parse(initialMd ?? '');
    } catch (err) {
      console.error('[EasyProseMirror] parse initial markdown failed, fallback to empty doc:', err);
      doc = customParser.parse('');
    }

    const state = EditorState.create({
      doc,
      schema: markdownSchema,
      plugins: buildPlugins(markdownSchema),
    });

    this.view = new EditorView(editorEl, {
      state,
      dispatchTransaction: (tr: Transaction) => {
        if (!this.view) return;
        const newState = this.view.state.apply(tr);
        this.view.updateState(newState);
        if (tr.docChanged && !this.suppressInput && typeof this.opts.input === 'function') {
          try {
            this.opts.input(this.getValue());
          } catch (err) {
            console.error('[EasyProseMirror] input callback threw:', err);
          }
        }
      },
    });

    // 为了让 main.js 中 `[internal.ir, internal.wysiwyg, internal.sv]` 这种
    // 遍历逻辑不爆炸，构造一个三个槽位都指向同一个 element 的对象。
    // 另外提供 lute.Md2VditorDOM stub 让 editor-runtime 的就绪检测通过。
    this.vditor = {
      ir: { element: editorEl },
      wysiwyg: { element: editorEl },
      sv: { element: editorEl },
      mode: 'wysiwyg',
      lute: {
        Md2VditorDOM: (md: string) => md, // 占位实现，仅用于通过 ready 检测
      },
    };
  }

  // ---------------- Vditor 兼容 API ----------------

  getValue(): string {
    if (!this.view) return '';
    try {
      return customSerializer.serialize(this.view.state.doc);
    } catch (err) {
      console.error('[EasyProseMirror] serialize failed:', err);
      return '';
    }
  }

  /** 与 Vditor 对齐：完全替换内容 */
  setValue(markdown: string, clearStack = false) {
    if (!this.view) return;
    let doc;
    try {
      doc = customParser.parse(markdown ?? '');
    } catch (err) {
      console.error('[EasyProseMirror] parse new value failed:', err);
      return;
    }
    const newState = EditorState.create({
      doc,
      schema: markdownSchema,
      plugins: this.view.state.plugins,
    });
    this.suppressInput = true;
    try {
      this.view.updateState(newState);
    } finally {
      this.suppressInput = false;
    }
    // Vditor 的 setValue 不会触发 input；保持一致
    void clearStack;
  }

  /** 在光标位置插入文本（粗略对齐 Vditor.insertValue） */
  insertValue(text: string) {
    if (!this.view) return;
    const { state, dispatch } = this.view;
    const tr = state.tr.insertText(text, state.selection.from, state.selection.to);
    dispatch(tr);
  }

  /** 当前是否就绪（与 vditorReady 含义相同） */
  isReady(): boolean {
    return !!this.view && !this.destroyed;
  }

  focus() {
    if (this.view) this.view.focus();
  }

  blur() {
    if (this.view) (this.view.dom as HTMLElement).blur();
  }

  destroy() {
    this.destroyed = true;
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    this.vditor = null;
    this.host.classList.remove('easy-pm-host', 'easy-pm-dark');
    this.host.innerHTML = '';
  }

  /** 切换主题。Vditor 用的是 setTheme(theme, contentTheme, codeTheme)；这里只关心明暗。 */
  setTheme(theme: 'classic' | 'dark') {
    if (theme === 'dark') {
      this.host.classList.add('easy-pm-dark');
    } else {
      this.host.classList.remove('easy-pm-dark');
    }
  }

  /** 与 Vditor 对齐：返回当前选区中是否处于某种格式。空实现，保留兼容。 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getCurrentMode(): string {
    return 'wysiwyg';
  }

  /** 占位：上传图片由外围 js/files.js 等通过 insertValue 注入 markdown 即可。 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tip(_message: string, _time?: number) {
    /* no-op: 外围已有自己的 showMessage */
  }
}

export default EasyProseMirrorEditor;
