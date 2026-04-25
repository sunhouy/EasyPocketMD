import { useAppStore } from '../store/useAppStore';
import { useEditorStore } from '../store/useEditorStore';
import ProseMirrorEditor from './ProseMirrorEditor';
import EditorAdapter from './EditorAdapter';

export default function EditorLayout() {
  const editorType = useEditorStore((s) => s.editorType);
  const setEditorType = useEditorStore((s) => s.setEditorType);
  const setProsemirrorContent = useEditorStore((s) => s.setProsemirrorContent);
  const prosemirrorContent = useEditorStore((s) => s.prosemirrorContent);
  const currentFileId = useAppStore((s) => s.currentFileId);

  return (
    <>
      {/* Always render toggle for switching editor
      <div className="editor-toggle-bar" style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span className="editor-badge" style={{
          background: editorType === 'prosemirror' ? '#4caf50' : '#2196f3',
          color: '#fff',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 12,
        }}>
          {editorType === 'prosemirror' ? 'ProseMirror' : 'Vditor'}
        </span>
        <button
          className="editor-switch-btn"
          style={{
            padding: '4px 10px',
            fontSize: 12,
            cursor: 'pointer',
            border: '1px solid #ccc',
            borderRadius: 4,
            background: '#fff',
          }}
          onClick={() => {
            const next = editorType === 'vditor' ? 'prosemirror' : 'vditor';
            setEditorType(next);
            if (next === 'vditor' && typeof (window as any).applyOutline === 'function') {
              setTimeout(() => (window as any).applyOutline(), 100);
            }
          }}
        >
          Switch to {editorType === 'prosemirror' ? 'Vditor' : 'ProseMirror'}
        </button>
      </div> */}

        <ProseMirrorEditor
          fileId={currentFileId}
          initialContent={prosemirrorContent ?? ''}
          onChange={(md) => setProsemirrorContent(md)}
          className="prosemirror-editor"
        >
          <EditorAdapter />
        </ProseMirrorEditor>
    </>
  );
}
