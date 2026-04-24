import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';

const highlightsKey = new PluginKey('syntaxHighlight');

let hljsModule: typeof import('highlight.js').default | null = null;
let hljsReady = false;

async function ensureHighlightJs(): Promise<void> {
  if (hljsReady) return;
  try {
    const hljs = await import('highlight.js/lib/core');
    hljsModule = hljs.default;

    const langModules = {
      javascript: () => import('highlight.js/lib/languages/javascript'),
      typescript: () => import('highlight.js/lib/languages/typescript'),
      css: () => import('highlight.js/lib/languages/css'),
      xml: () => import('highlight.js/lib/languages/xml'),
      json: () => import('highlight.js/lib/languages/json'),
      bash: () => import('highlight.js/lib/languages/bash'),
      python: () => import('highlight.js/lib/languages/python'),
    };

    for (const [name, loader] of Object.entries(langModules)) {
      try {
        const mod = await loader();
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
