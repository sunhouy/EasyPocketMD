import { useAppStore } from '../store/useAppStore';
import { useEditorStore } from '../store/useEditorStore';
import { useUIStore } from '../store/useUIStore';

let isSyncing = false;

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => isEqual(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => isEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function initAppStoreBridge() {
  useAppStore.subscribe((state, prevState) => {
    if (isSyncing) return;

    try {
      isSyncing = true;

      if (!isEqual(state.currentUser, prevState.currentUser)) {
        window.currentUser = state.currentUser;
        if (state.currentUser) {
          localStorage.setItem('vditor_user', JSON.stringify(state.currentUser));
        } else {
          localStorage.removeItem('vditor_user');
        }
      }

      if (!isEqual(state.files, prevState.files)) {
        window.files = state.files;
        localStorage.setItem('vditor_files', JSON.stringify(state.files));
      }

      if (!isEqual(state.currentFileId, prevState.currentFileId)) {
        window.currentFileId = state.currentFileId;
      }

      if (!isEqual(state.unsavedChanges, prevState.unsavedChanges)) {
        window.unsavedChanges = state.unsavedChanges;
      }

      if (!isEqual(state.lastSyncedContent, prevState.lastSyncedContent)) {
        window.lastSyncedContent = state.lastSyncedContent;
      }

      if (!isEqual(state.appSessionId, prevState.appSessionId)) {
        window.appSessionId = state.appSessionId;
      }
    } finally {
      isSyncing = false;
    }
  });

  Object.defineProperty(window, 'currentUser', {
    set(value) {
      if (isSyncing) return;
      const current = useAppStore.getState().currentUser;
      if (isEqual(value, current)) return;
      try {
        isSyncing = true;
        useAppStore.setState({ currentUser: value });
      } finally {
        isSyncing = false;
      }
    },
    get() { return useAppStore.getState().currentUser; },
    configurable: true,
  });

  Object.defineProperty(window, 'files', {
    set(value) {
      if (isSyncing) return;
      const current = useAppStore.getState().files;
      if (isEqual(value, current)) return;
      try {
        isSyncing = true;
        useAppStore.setState({ files: value });
      } finally {
        isSyncing = false;
      }
    },
    get() { return useAppStore.getState().files; },
    configurable: true,
  });

  Object.defineProperty(window, 'currentFileId', {
    set(value) {
      if (isSyncing) return;
      const current = useAppStore.getState().currentFileId;
      if (isEqual(value, current)) return;
      try {
        isSyncing = true;
        useAppStore.setState({ currentFileId: value });
      } finally {
        isSyncing = false;
      }
    },
    get() { return useAppStore.getState().currentFileId; },
    configurable: true,
  });

  Object.defineProperty(window, 'unsavedChanges', {
    set(value) {
      if (isSyncing) return;
      const current = useAppStore.getState().unsavedChanges;
      if (isEqual(value, current)) return;
      try {
        isSyncing = true;
        useAppStore.setState({ unsavedChanges: value });
      } finally {
        isSyncing = false;
      }
    },
    get() { return useAppStore.getState().unsavedChanges; },
    configurable: true,
  });

  Object.defineProperty(window, 'lastSyncedContent', {
    set(value) {
      if (isSyncing) return;
      const current = useAppStore.getState().lastSyncedContent;
      if (isEqual(value, current)) return;
      try {
        isSyncing = true;
        useAppStore.setState({ lastSyncedContent: value });
      } finally {
        isSyncing = false;
      }
    },
    get() { return useAppStore.getState().lastSyncedContent; },
    configurable: true,
  });

  Object.defineProperty(window, 'appSessionId', {
    set(value) {
      if (isSyncing) return;
      const current = useAppStore.getState().appSessionId;
      if (isEqual(value, current)) return;
      try {
        isSyncing = true;
        useAppStore.setState({ appSessionId: value });
      } finally {
        isSyncing = false;
      }
    },
    get() { return useAppStore.getState().appSessionId; },
    configurable: true,
  });
}

function initEditorStoreBridge() {
  useEditorStore.subscribe((state, prevState) => {
    if (isSyncing) return;

    try {
      isSyncing = true;

      if (state.vditorReady !== prevState.vditorReady) {
        window.vditorReady = state.vditorReady;
      }

      if (state.editorType !== prevState.editorType) {
        window.editorType = state.editorType;
      }

      if (state.prosemirrorContent !== prevState.prosemirrorContent) {
        window.prosemirrorContent = state.prosemirrorContent;
      }
    } finally {
      isSyncing = false;
    }
  });

  Object.defineProperty(window, 'vditorReady', {
    set(value) {
      if (isSyncing) return;
      if (useEditorStore.getState().vditorReady === value) return;
      try {
        isSyncing = true;
        useEditorStore.getState().setVditorReady(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useEditorStore.getState().vditorReady; },
    configurable: true,
  });

  Object.defineProperty(window, 'editorType', {
    set(value) {
      if (isSyncing) return;
      if (useEditorStore.getState().editorType === value) return;
      try {
        isSyncing = true;
        useEditorStore.getState().setEditorType(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useEditorStore.getState().editorType; },
    configurable: true,
  });

  Object.defineProperty(window, 'prosemirrorContent', {
    set(value) {
      if (isSyncing) return;
      if (useEditorStore.getState().prosemirrorContent === value) return;
      try {
        isSyncing = true;
        useEditorStore.getState().setProsemirrorContent(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useEditorStore.getState().prosemirrorContent; },
    configurable: true,
  });
}

function initUIStoreBridge() {
  useUIStore.subscribe((state, prevState) => {
    if (isSyncing) return;

    try {
      isSyncing = true;

      if (state.nightMode !== prevState.nightMode) {
        window.nightMode = state.nightMode;
        localStorage.setItem('vditor_night_mode', String(state.nightMode));
      }

      if (!isEqual(state.userSettings, prevState.userSettings)) {
        window.userSettings = state.userSettings;
        localStorage.setItem('vditor_settings', JSON.stringify(state.userSettings));
      }

      if (state.isFileManagementMode !== prevState.isFileManagementMode) {
        window.isFileManagementMode = state.isFileManagementMode;
      }

      if (state.isFileSwitchLoading !== prevState.isFileSwitchLoading) {
        window.isFileSwitchLoading = state.isFileSwitchLoading;
      }

      if (state.toolbarUncertaintyUnlocked !== prevState.toolbarUncertaintyUnlocked) {
        window.toolbarUncertaintyUnlocked = state.toolbarUncertaintyUnlocked;
      }

      if (state.startInFileManagementMode !== prevState.startInFileManagementMode) {
        window.startInFileManagementMode = state.startInFileManagementMode;
      }

      if (state.deferInitialFileOpen !== prevState.deferInitialFileOpen) {
        window.deferInitialFileOpen = state.deferInitialFileOpen;
      }

      if (state.isTauriMobileEnvironment !== prevState.isTauriMobileEnvironment) {
        window.isTauriMobileEnvironment = state.isTauriMobileEnvironment;
      }
    } finally {
      isSyncing = false;
    }
  });

  Object.defineProperty(window, 'nightMode', {
    set(value) {
      if (isSyncing) return;
      if (useUIStore.getState().nightMode === value) return;
      try {
        isSyncing = true;
        useUIStore.getState().setNightMode(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useUIStore.getState().nightMode; },
    configurable: true,
  });

  Object.defineProperty(window, 'userSettings', {
    set(value) {
      if (isSyncing) return;
      if (isEqual(useUIStore.getState().userSettings, value)) return;
      try {
        isSyncing = true;
        useUIStore.getState().setUserSettings(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useUIStore.getState().userSettings; },
    configurable: true,
  });

  Object.defineProperty(window, 'isFileManagementMode', {
    set(value) {
      if (isSyncing) return;
      if (useUIStore.getState().isFileManagementMode === value) return;
      try {
        isSyncing = true;
        useUIStore.getState().setIsFileManagementMode(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useUIStore.getState().isFileManagementMode; },
    configurable: true,
  });

  Object.defineProperty(window, 'isFileSwitchLoading', {
    set(value) {
      if (isSyncing) return;
      if (useUIStore.getState().isFileSwitchLoading === value) return;
      try {
        isSyncing = true;
        useUIStore.getState().setIsFileSwitchLoading(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useUIStore.getState().isFileSwitchLoading; },
    configurable: true,
  });

  Object.defineProperty(window, 'toolbarUncertaintyUnlocked', {
    set(value) {
      if (isSyncing) return;
      if (useUIStore.getState().toolbarUncertaintyUnlocked === value) return;
      try {
        isSyncing = true;
        useUIStore.getState().setToolbarUncertaintyUnlocked(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useUIStore.getState().toolbarUncertaintyUnlocked; },
    configurable: true,
  });

  Object.defineProperty(window, 'startInFileManagementMode', {
    set(value) {
      if (isSyncing) return;
      if (useUIStore.getState().startInFileManagementMode === value) return;
      try {
        isSyncing = true;
        useUIStore.getState().setStartInFileManagementMode(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useUIStore.getState().startInFileManagementMode; },
    configurable: true,
  });

  Object.defineProperty(window, 'deferInitialFileOpen', {
    set(value) {
      if (isSyncing) return;
      if (useUIStore.getState().deferInitialFileOpen === value) return;
      try {
        isSyncing = true;
        useUIStore.getState().setDeferInitialFileOpen(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useUIStore.getState().deferInitialFileOpen; },
    configurable: true,
  });

  Object.defineProperty(window, 'isTauriMobileEnvironment', {
    set(value) {
      if (isSyncing) return;
      if (useUIStore.getState().isTauriMobileEnvironment === value) return;
      try {
        isSyncing = true;
        useUIStore.getState().setIsTauriMobileEnvironment(value);
      } finally {
        isSyncing = false;
      }
    },
    get() { return useUIStore.getState().isTauriMobileEnvironment; },
    configurable: true,
  });
}

export function initGlobalBridge() {
  if ((window as unknown as Record<string, unknown>).__bridgeInitialized) return;
  (window as unknown as Record<string, unknown>).__bridgeInitialized = true;

  initAppStoreBridge();
  initEditorStoreBridge();
  initUIStoreBridge();
}