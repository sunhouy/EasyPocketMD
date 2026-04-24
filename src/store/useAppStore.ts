import { create } from 'zustand';
import type { DraftPayload } from '../../js/files/types';

interface User {
  id: string;
  username: string;
  email?: string;
  token?: string;
}

interface FileRecord {
  id: string;
  name: string;
  content: string;
  created: number;
  modified: number;
  tags?: string[];
  synced?: boolean;
}

interface AppState {
  currentUser: User | null;
  files: FileRecord[];
  currentFileId: string | null;
  unsavedChanges: Record<string, boolean>;
  pendingServerSync: Record<string, boolean>;
  lastSyncedContent: Record<string, string>;
  appSessionId: string;
  setCurrentUser: (user: User | null) => void;
  setFiles: (files: FileRecord[]) => void;
  setCurrentFileId: (fileId: string | null) => void;
  setUnsavedChanges: (changes: Record<string, boolean>) => void;
  setPendingServerSync: (syncMap: Record<string, boolean>) => void;
  setLastSyncedContent: (content: Record<string, string>) => void;
  setAppSessionId: (sessionId: string) => void;
  addFile: (file: FileRecord) => void;
  updateFile: (fileId: string, updates: Partial<FileRecord>) => void;
  removeFile: (fileId: string) => void;
  markUnsaved: (fileId: string, unsaved: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: JSON.parse(localStorage.getItem('vditor_user') || 'null'),
  files: JSON.parse(localStorage.getItem('vditor_files') || '[]'),
  currentFileId: null,
  unsavedChanges: {},
  pendingServerSync: {},
  lastSyncedContent: {},
  appSessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,

  setCurrentUser: (user) => set({ currentUser: user }),

  setFiles: (files) => set({ files }),

  setCurrentFileId: (fileId) => set({ currentFileId: fileId }),

  setUnsavedChanges: (changes) => set({ unsavedChanges: changes }),

  setPendingServerSync: (syncMap) => set({ pendingServerSync: syncMap }),

  setLastSyncedContent: (content) => set({ lastSyncedContent: content }),

  setAppSessionId: (sessionId) => set({ appSessionId: sessionId }),

  addFile: (file) =>
    set((state) => {
      const newFiles = [...state.files, file];
      localStorage.setItem('vditor_files', JSON.stringify(newFiles));
      return { files: newFiles };
    }),

  updateFile: (fileId, updates) =>
    set((state) => {
      const newFiles = state.files.map((f) =>
        f.id === fileId ? { ...f, ...updates } : f
      );
      localStorage.setItem('vditor_files', JSON.stringify(newFiles));
      return { files: newFiles };
    }),

  removeFile: (fileId) =>
    set((state) => {
      const newFiles = state.files.filter((f) => f.id !== fileId);
      localStorage.setItem('vditor_files', JSON.stringify(newFiles));
      return { files: newFiles };
    }),

  markUnsaved: (fileId, unsaved) =>
    set((state) => ({
      unsavedChanges: { ...state.unsavedChanges, [fileId]: unsaved },
    })),
}));