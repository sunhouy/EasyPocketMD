import { create } from 'zustand';

interface EditorState {
  vditorReady: boolean;
  _vditorInstance: unknown;
  setVditorReady: (ready: boolean) => void;
  setVditorInstance: (instance: unknown) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  vditorReady: false,
  _vditorInstance: null,

  setVditorReady: (ready) => set({ vditorReady: ready }),

  setVditorInstance: (instance) => set({ _vditorInstance: instance }),
}));