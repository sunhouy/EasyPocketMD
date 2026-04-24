import { create } from 'zustand';

interface EditorState {
  vditorReady: boolean;
  _vditorInstance: unknown;
  editorType: 'vditor' | 'prosemirror';
  prosemirrorContent: string | null;
  setVditorReady: (ready: boolean) => void;
  setVditorInstance: (instance: unknown) => void;
  setEditorType: (type: 'vditor' | 'prosemirror') => void;
  setProsemirrorContent: (content: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  vditorReady: false,
  _vditorInstance: null,
  editorType: (localStorage.getItem('editor_type') as 'vditor' | 'prosemirror') || 'vditor',
  prosemirrorContent: null,

  setVditorReady: (ready) => set({ vditorReady: ready }),

  setVditorInstance: (instance) => set({ _vditorInstance: instance }),

  setEditorType: (type) => {
    localStorage.setItem('editor_type', type);
    set({ editorType: type });
  },

  setProsemirrorContent: (content) => set({ prosemirrorContent: content }),
}));
