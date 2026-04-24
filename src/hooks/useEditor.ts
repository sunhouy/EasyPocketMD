import { createContext, useContext } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Schema } from 'prosemirror-model';

/** Command: (state, dispatch?) => boolean */
export type EditorCommand = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

export interface EditorContextValue {
  view: EditorView | null;
  schema: Schema;
  execCommand: (cmd: EditorCommand) => boolean;
  isReady: boolean;
}

export const EditorContext = createContext<EditorContextValue>({
  view: null,
  schema: null as unknown as Schema,
  execCommand: () => false,
  isReady: false,
});

export function useEditor(): EditorContextValue {
  return useContext(EditorContext);
}
