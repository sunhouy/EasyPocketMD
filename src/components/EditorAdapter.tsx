import { useEffect, useRef } from 'react';
import { undo, redo } from 'prosemirror-history';
import { useEditor } from '../hooks/useEditor';
import { customParser, customSerializer } from '../prosemirror/parser';

/**
 * EditorAdapter bridges legacy window.vditor calls to the ProseMirror EditorView.
 *
 * Usage: Place <EditorAdapter /> inside a <ProseMirrorEditor> or any component
 * wrapped by EditorContext.Provider.
 *
 * TODO: remove after Vditor cleanup sprint
 */
export default function EditorAdapter() {
  const { view, execCommand, isReady } = useEditor();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!view || syncedRef.current) return;

    const adapter = {
      getValue: () => {
        return customSerializer.serialize(view.state.doc);
      },
      setValue: (markdown: string) => {
        const doc = customParser.parse(markdown);
        const tr = view.state.tr.replaceWith(
          0,
          view.state.doc.content.size,
          doc.content,
        );
        view.updateState(view.state.apply(tr));
      },
      destroy: () => {
        delete (window as any).vditor;
        syncedRef.current = false;
      },
      get vditor() {
        return {
          undo: {
            undo: () => execCommand(undo),
            redo: () => execCommand(redo),
          },
        };
      },
      focus: () => view.dom.focus(),
      get ready() {
        return isReady;
      },
    };

    (window as any).vditor = adapter;

    if (typeof (window as any).__resolveVditorInit === 'function') {
      (window as any).__resolveVditorInit();
    }

    syncedRef.current = true;

    return () => {
      if (syncedRef.current) {
        delete (window as any).vditor;
        syncedRef.current = false;
      }
    };
  }, [view, execCommand, isReady]);

  return null;
}
