import { useEffect } from 'react';
import { useEditorStore } from '../../store/useEditorStore';

/**
 * Vditor 由 `js/main.js` 中 `ensureVditorInitialized` 在 `#vditor` 上完成 `new Vditor('vditor', editorConfig)`。
 * 本组件仅在 React 树中提供挂载节点；该 Promise 为幂等，与入口处的初始化共存。
 */
export default function Editor() {
  useEffect(() => {
    if (typeof window.ensureVditorInitialized !== 'function') return undefined;
    let cancelled = false;
    window.ensureVditorInitialized().then((inst) => {
      if (!cancelled && inst) {
        useEditorStore.getState().setVditorInstance(inst);
      }
    }).catch(() => {
      /* 入口已 console.error */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-epmd-editor-host
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        id="vditor"
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          minHeight: 0,
          visibility: 'hidden',
        }}
      />
    </div>
  );
}
