import { useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { customParser, customSerializer } from '../prosemirror/parser';
import { buildPlugins } from '../prosemirror/plugins';
import { markdownSchema } from '../prosemirror/schema';
import { EditorContext, type EditorCommand } from '../hooks/useEditor';

export interface ProseMirrorEditorProps {
  fileId: string | null;
  initialContent: string;
  onChange?: (markdown: string) => void;
  className?: string;
  children?: ReactNode;
}

export default function ProseMirrorEditor({
  fileId,
  initialContent,
  onChange,
  className,
  children,
}: ProseMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const isReadyRef = useRef(false);

  const execCommand = useCallback((cmd: EditorCommand): boolean => {
    if (!viewRef.current) return false;
    return cmd(viewRef.current.state, viewRef.current.dispatch);
  }, []);

  // Build plugins once per mount
  const plugins = useMemo(() => buildPlugins(markdownSchema), []);

  useEffect(() => {
    if (!editorRef.current) return;

    // Destroy previous instance
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    try {
      const doc = customParser.parse(initialContent ?? '');

      const state = EditorState.create({
        doc,
        schema: markdownSchema,
        plugins,
      });

      viewRef.current = new EditorView(editorRef.current, {
        state,
        dispatchTransaction(tr) {
          const view = viewRef.current;
          if (!view) return;

          const newState = view.state.apply(tr);
          view.updateState(newState);

          if (tr.docChanged && onChangeRef.current) {
            onChangeRef.current(customSerializer.serialize(newState.doc));
          }
        },
      });

      isReadyRef.current = true;
    } catch (err) {
      console.error('ProseMirror init failed:', err);
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      isReadyRef.current = false;
    };
  }, [fileId]); // Rebuild on fileId change

  const contextValue = useMemo(
    () => ({
      view: viewRef.current,
      schema: markdownSchema,
      execCommand,
      isReady: isReadyRef.current,
    }),
    [execCommand],
  );

  return (
    <EditorContext.Provider value={contextValue}>
      <div className="prosemirror-editor-container">
        <div ref={editorRef} className={className ?? 'prosemirror-editor'} />
      </div>
      {children}
    </EditorContext.Provider>
  );
}
