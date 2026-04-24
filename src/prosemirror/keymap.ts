import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import {
  toggleMark,
  setBlockType,
  wrapIn,
  chainCommands,
  exitCode,
} from 'prosemirror-commands';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import type { Schema } from 'prosemirror-model';

export function buildKeymap(schema: Schema) {
  const marks = schema.marks;
  const nodes = schema.nodes;

  const toggleBold = toggleMark(marks.strong);
  const toggleItalic = toggleMark(marks.em);
  const toggleStrike = toggleMark(marks.strike);
  const toggleCode = toggleMark(marks.code);

  // Mod = Cmd on macOS, Ctrl on other platforms
  return keymap({
    'Mod-b': toggleBold,
    'Mod-i': toggleItalic,
    'Mod-d': toggleStrike,
    'Mod-`': toggleCode,

    // Lists
    'Tab': sinkListItem(nodes.list_item),
    'Shift-Tab': liftListItem(nodes.list_item),

    // Enter handling — split list item or create new paragraph
    'Enter': chainCommands(
      splitListItem(nodes.list_item),
      exitCode,
    ),

    // Mod-Enter exits code block
    'Mod-Enter': exitCode,

    // History
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo,

    // Blockquote toggle
    'Mod-Alt-q': wrapIn(nodes.blockquote),

    // Backspace at start of blockquote lifts out
    'Backspace': (state, dispatch) => {
      const { $from } = state.selection;
      if ($from.node(-1)?.type === nodes.blockquote && $from.parentOffset === 0) {
        return chainCommands(liftListItem(nodes.list_item))(state, dispatch);
      }
      return false;
    },
  });
}
