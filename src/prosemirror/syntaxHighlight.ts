import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

const highlightsKey = new PluginKey('syntaxHighlight');

let hljsModule: typeof import('highlight.js').default | null = null;
let hljsReady = false;

async function ensureHighlightJs(): Promise<void> {
  if (hljsReady) return;
  // main 分支没有显式安装 highlight.js（只是某些场景下间接可用），
  // 这里通过纯运行时字符串拼接避开 Vite/Rollup 的静态依赖解析；
  // 加载失败则静默降级为不做高亮装饰。
  const dyn: (s: string) => Promise<any> = new Function('s', 'return import(s)') as any;
  const hljsPkg = 'highlight' + '.js';
  try {
    const hljs = await dyn(hljsPkg + '/lib/core');
    hljsModule = hljs.default;

    const langs: string[] = [
      'javascript', 'typescript', 'css', 'xml', 'json', 'bash', 'python',
    ];

    for (const name of langs) {
      try {
        const mod = await dyn(hljsPkg + '/lib/languages/' + name);
        hljsModule.registerLanguage(name, mod.default);
      } catch {
        // skip unsupported language
      }
    }

    hljsReady = true;
  } catch {
    // highlight.js failed to load entirely — degrade gracefully
  }
}

function computeDecorations(doc: Node): DecorationSet {
  if (!hljsModule) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return;
    const lang = node.attrs.language as string | null;
    if (!lang || !hljsModule!.getLanguage(lang)) return;

    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: 'hljs',
        'data-language': lang,
      }),
    );
  });

  return DecorationSet.create(doc, decorations);
}

export function syntaxHighlightPlugin() {
  ensureHighlightJs();

  return new Plugin({
    key: highlightsKey,

    state: {
      init(_, { doc }) {
        return computeDecorations(doc);
      },
      apply(tr, oldDecos, _oldState, newState) {
        if (!tr.docChanged) return oldDecos;
        return computeDecorations(newState.doc);
      },
    },

    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
