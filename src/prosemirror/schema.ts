import { Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

export const markdownSchema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },

    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },

    blockquote: {
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'blockquote' }],
      toDOM() {
        return ['blockquote', 0];
      },
    },

    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM() {
        return ['hr'];
      },
    },

    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 4 } },
        { tag: 'h5', attrs: { level: 5 } },
        { tag: 'h6', attrs: { level: 6 } },
      ],
      toDOM(node) {
        return ['h' + node.attrs.level, 0];
      },
    },

    code_block: {
      content: 'text*',
      group: 'block',
      code: true,
      attrs: { language: { default: null } },
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs(node) {
            const el = node as HTMLElement;
            const code = el.querySelector('code');
            const lang = code?.getAttribute('class')?.replace('language-', '') ?? null;
            return { language: lang };
          },
        },
      ],
      toDOM(node) {
        const attrs: Record<string, string> = {};
        if (node.attrs.language) {
          attrs['data-language'] = node.attrs.language;
        }
        return ['pre', attrs, ['code', 0]];
      },
    },

    text: {
      group: 'inline',
    },

    image: {
      inline: true,
      attrs: {
        src: {},
        alt: { default: null },
        title: { default: null },
      },
      group: 'inline',
      draggable: true,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs(dom) {
            const el = dom as HTMLImageElement;
            return {
              src: el.getAttribute('src'),
              alt: el.getAttribute('alt'),
              title: el.getAttribute('title'),
            };
          },
        },
      ],
      toDOM(node) {
        const { src, alt, title } = node.attrs;
        return ['img', { src, alt, title }];
      },
    },

    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() {
        return ['br'];
      },
    },

    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM() {
        return ['ul', 0];
      },
    },

    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 } },
      parseDOM: [
        {
          tag: 'ol',
          getAttrs(dom) {
            const el = dom as HTMLOListElement;
            return { order: parseInt(el.getAttribute('start') ?? '1', 10) };
          },
        },
      ],
      toDOM(node) {
        return node.attrs.order === 1
          ? ['ol', 0]
          : ['ol', { start: node.attrs.order }, 0];
      },
    },

    list_item: {
      content: 'paragraph block*',
      parseDOM: [{ tag: 'li' }],
      toDOM() {
        return ['li', 0];
      },
      defining: true,
    },

    task_item: {
      content: 'paragraph block*',
      attrs: { checked: { default: false } },
      parseDOM: [
        {
          tag: 'li[data-task-item]',
          getAttrs(dom) {
            const el = dom as HTMLElement;
            return { checked: el.getAttribute('data-checked') === 'true' };
          },
        },
        {
          tag: 'li.task-list-item',
          getAttrs(dom) {
            const el = dom as HTMLElement;
            const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
            return { checked: checkbox?.checked ?? false };
          },
        },
      ],
      toDOM(node) {
        const { checked } = node.attrs;
        return [
          'li',
          { 'data-task-item': 'true', 'data-checked': String(checked) },
          ['input', { type: 'checkbox', checked: checked ? '' : undefined }],
          ['span', 0],
        ];
      },
      defining: true,
    },

    ...tableNodes({
      tableGroup: 'block',
      cellContent: 'paragraph',
      cellAttributes: {},
    }),

    frontmatter: {
      content: 'text*',
      group: 'block',
      parseDOM: [
        {
          tag: 'div.frontmatter',
          preserveWhitespace: 'full',
        },
      ],
      toDOM() {
        return ['div', { class: 'frontmatter' }, 0];
      },
      code: true,
      isolating: true,
    },
  },

  marks: {
    em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM() {
        return ['em', 0];
      },
    },

    strong: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b' },
        { style: 'font-weight=bold' },
      ],
      toDOM() {
        return ['strong', 0];
      },
    },

    link: {
      attrs: {
        href: {},
        title: { default: null },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs(dom) {
            const el = dom as HTMLAnchorElement;
            return { href: el.getAttribute('href'), title: el.getAttribute('title') };
          },
        },
      ],
      toDOM(node) {
        const { href, title } = node.attrs;
        return ['a', { href, title }, 0];
      },
    },

    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() {
        return ['code', 0];
      },
    },

    strike: {
      parseDOM: [
        { tag: 's' },
        { tag: 'del' },
        { tag: 'strike' },
        { style: 'text-decoration=line-through' },
      ],
      toDOM() {
        return ['s', 0];
      },
    },
  },
});
