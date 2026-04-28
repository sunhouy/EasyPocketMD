import type {Transformer} from '@lexical/markdown';

import {TRANSFORMERS} from '@lexical/markdown';

export type MarkdownFlavor = 'basic' | 'gfm';

/**
 * 基础 Markdown（CommonMark-ish）transformers。
 * 后续升级到 GFM 时，在这里追加/替换 transformers 即可，尽量避免改动 Editor 组件。
 */
export const BASIC_MARKDOWN_TRANSFORMERS: Array<Transformer> =
  Array.from(TRANSFORMERS);

export function getMarkdownTransformers(
  flavor: MarkdownFlavor = 'basic',
): Array<Transformer> {
  switch (flavor) {
    case 'basic':
      return Array.from(BASIC_MARKDOWN_TRANSFORMERS);
    case 'gfm':
      // 预留：未来接入 GFM（table/task list/strikethrough 等）的 transformers。
      // 当前先返回基础集合，保证调用方接口稳定。
      return Array.from(BASIC_MARKDOWN_TRANSFORMERS);
    default: {
      const _exhaustive: never = flavor;
      return _exhaustive;
    }
  }
}

