import { history } from 'prosemirror-history';
import { gapCursor } from 'prosemirror-gapcursor';
import { dropCursor } from 'prosemirror-dropcursor';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import type { Schema } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';
import { buildKeymap } from './keymap';
import { buildInputRules } from './inputrules';
import { syntaxHighlightPlugin } from './syntaxHighlight';

export function buildPlugins(schema: Schema): Plugin[] {
  return [
    history(),
    gapCursor(),
    dropCursor(),
    keymap(baseKeymap),
    buildKeymap(schema),
    buildInputRules(schema),
    syntaxHighlightPlugin(),
  ];
}
