import MarkdownIt from 'markdown-it';
import type { default as Token } from 'markdown-it/lib/token.mjs';
import type { Attrs } from 'prosemirror-model';
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
import { markdownSchema } from './schema';

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

// Enable GFM tables (built-in for markdown-it 14+)
md.enable('table');
// Enable strikethrough (needed for ~~strike~~)
md.enable('strikethrough');

md.use(require('markdown-it-task-lists'));

// Custom plugin: detect task-list-item class on list_item tokens
// and emit a separate token type so the parser can map it to task_item node
md.core.ruler.after('github-task-lists', 'prosemirror-task-list', (state) => {
  for (const token of state.tokens) {
    if (
      (token.type === 'list_item_open' || token.type === 'list_item_close') &&
      token.attrGet('class') === 'task-list-item'
    ) {
      token.type = token.type === 'list_item_open'
        ? 'task_list_item_open'
        : 'task_list_item_close';
    }
  }
});


const tokens: Record<string, import('prosemirror-markdown').ParseSpec> = {
  paragraph: { block: 'paragraph' },
  heading: {
    block: 'heading',
    getAttrs(tok: Token): Attrs | null {
      return { level: parseInt(tok.tag.slice(1), 10) };
    },
  },
  blockquote: { block: 'blockquote' },
  hr: { node: 'horizontal_rule', noCloseToken: true },
  code_block: { block: 'code_block' },
  fence: {
    block: 'code_block',
    noCloseToken: true,
    getAttrs(tok: Token): Attrs | null {
      return { language: tok.info?.split(/\s+/)[0] || null };
    },
  },
  bullet_list: { block: 'bullet_list' },
  ordered_list: {
    block: 'ordered_list',
    getAttrs(tok: Token): Attrs | null {
      return { order: parseInt(tok.attrGet('start') ?? '1', 10) };
    },
  },
  list_item: { block: 'list_item' },
  task_list_item: {
    block: 'task_item',
    getAttrs(tok: Token): Attrs | null {
      const checked =
        tok.attrGet('data-checked') === 'true' ||
        tok.attrGet('checked') !== null;
      return { checked };
    },
  },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_header' },
  td: { block: 'table_cell' },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  link: {
    mark: 'link',
    getAttrs(tok: Token): Attrs | null {
      return {
        href: tok.attrGet('href') ?? '',
        title: tok.attrGet('title') ?? null,
      };
    },
  },
  code_inline: { mark: 'code', noCloseToken: true },
  s: { mark: 'strike' },
  strike: { mark: 'strike' },
  image: {
    node: 'image',
    getAttrs(tok: Token): Attrs | null {
      return {
        src: tok.attrGet('src') ?? '',
        alt: tok.content || null,
        title: tok.attrGet('title') ?? null,
      };
    },
  },
  hardbreak: { node: 'hard_break' },
  html_inline: { ignore: true, noCloseToken: true },
  html_block: { ignore: true, noCloseToken: true },
};

export const customParser = new MarkdownParser(markdownSchema, md, tokens);

function serializeNodes() {
  const nodes: Record<string, (state: any, node: any, parent: any, index: number) => void> = {};

  nodes.paragraph = (state, node) => {
    state.renderInline(node);
    state.closeBlock(node);
  };

  nodes.heading = (state, node) => {
    state.write(state.repeat('#', node.attrs.level) + ' ');
    state.renderInline(node);
    state.closeBlock(node);
  };

  nodes.blockquote = (state, node) => {
    state.wrapBlock('> ', null, node, () => state.renderContent(node));
  };

  nodes.code_block = (state, node) => {
    const lang = node.attrs.language || '';
    state.write('```' + lang + '\n');
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write('```');
    state.closeBlock(node);
  };

  nodes.horizontal_rule = (state, node) => {
    state.write('---');
    state.closeBlock(node);
  };

  nodes.bullet_list = (state, node) => {
    state.renderList(node, '  ', () => '- ');
  };

  nodes.ordered_list = (state, node) => {
    const start = node.attrs.order || 1;
    const maxW = String(start + node.childCount - 1).length;
    const space = state.repeat(' ', maxW + 2);
    state.renderList(node, space, (i: number) => {
      const nStr = String(start + i);
      return state.repeat(' ', maxW - nStr.length) + nStr + '. ';
    });
  };

  nodes.list_item = (state, node) => {
    state.renderContent(node);
  };

  nodes.task_item = (state, node) => {
    const prefix = node.attrs.checked ? '- [x] ' : '- [ ] ';
    state.write(prefix);
    state.renderContent(node);
  };

  nodes.table = (state, node) => {
    state.renderContent(node);
    state.closeBlock(node);
  };

  nodes.table_row = (state, node) => {
    state.write('| ');
    state.renderContent(node);
    state.write('\n');
  };

  nodes.table_header = (state, node) => {
    state.renderContent(node);
  };

  nodes.table_cell = (state, node) => {
    state.renderInline(node);
    state.write(' | ');
  };

  nodes.frontmatter = (state, node) => {
    state.write('---\n');
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write('---');
    state.closeBlock(node);
  };

  nodes.image = (state, node) => {
    const alt = node.attrs.alt || '';
    const title = node.attrs.title ? ' "' + node.attrs.title + '"' : '';
    state.write(`![${alt}](${node.attrs.src}${title})`);
  };

  nodes.hard_break = (state, node, parent, index) => {
    for (let i = index + 1; i < parent.childCount; i++) {
      if (parent.child(i).type !== node.type) {
        state.write('\\\n');
        return;
      }
    }
  };

  nodes.text = (state, node) => {
    state.text(node.text!, false);
  };

  return nodes;
}

const serializerMarks: Record<string, any> = {
  em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
  strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  link: {
    open(_state: any, mark: any, parent: any, _index: number) {
      // Serialize as inline link: [text](href)
      // The text is the node content, so we just write the opening bracket
      // and the close will write the URL part.
      return '';
    },
    close(_state: any, mark: any, parent: any, _index: number) {
      // This approach doesn't work well — we need a different strategy.
      // ProseMirror's link serializer uses open/close differently.
      // Let me use a simpler approach.
      return '';
    },
  },
  code: { open: '`', close: '`', escape: false },
};

// For links, the standard serializer approach:
// The link mark wraps the text content.
// open is called before the content, close after.
// So for [text](url) we need open to output "[" and close to output "](url)"
const linkSerializer: Record<string, any> = {
  em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
  strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  link: {
    open: '[',
    close(_state: any, mark: any) {
      return '](' + mark.attrs.href + (mark.attrs.title ? ' "' + mark.attrs.title + '"' : '') + ')';
    },
    mixable: true,
  },
  code: { open: '`', close: '`', escape: false },
};

export const customSerializer = new MarkdownSerializer(serializeNodes(), linkSerializer);
