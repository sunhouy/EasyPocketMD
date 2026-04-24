interface Window {
  vditor: any;
  vditorReady: boolean;
  vditorInitPromise: Promise<any> | null;
  currentUser: any;
  files: any[];
  currentFileId: string | null;
  tauriBridge: any;
  wasmTextEngineGateway: any;
  _legacyEditorConfig: any;
  nightMode: boolean;
  unsavedChanges: Record<string, boolean>;
  userSettings: UserSettings;
  pendingServerSync: boolean;
  isFileSwitchLoading: boolean;
  appSessionId: string;
  autoSaveTimer: ReturnType<typeof setTimeout> | null;
  syncInterval: ReturnType<typeof setInterval> | null;
  lastSyncedContent: Record<string, string>;
  startInFileManagementMode: boolean;
  deferInitialFileOpen: boolean;
  isFileManagementMode: boolean;
  isTauriMobileEnvironment: boolean;
  toolbarUncertaintyUnlocked: boolean;
  editorType: 'vditor' | 'prosemirror';
  prosemirrorContent: string | null;
  enterFileManagementMode: (options?: any) => void;
  enterEditorMode: () => void;
  ensureWasmTextEngineReady: () => Promise<any>;
  ensureVditorInitialized: () => Promise<any>;
  onInitialFileListRendered: () => void;
  showSettingsDialog: () => void;
  showAboutDialog: () => void;
  showServiceStatusDialog: () => void;
  renderBottomToolbar: () => void;
  __resolveVditorInit: (() => void) | null;
  __rejectVditorInit: ((err: any) => void) | null;
  wasmTextEngineReadyPromise: Promise<any> | null;
  _hmt: any[];
  applyOutline: () => void;
}

interface UserSettings {
  toolbarButtons?: string[];
  themeMode?: 'system' | 'light' | 'dark';
  fontSize?: string;
  showOutline?: boolean;
  enableDebugMode?: boolean;
  enableSlashCommand?: boolean;
  slashCommandActivationKey?: string;
  defaultEditorMode?: 'wysiwyg' | 'ir' | 'sv';
  language?: string;
  uiMode?: 'auto' | 'mobile' | 'desktop';
  storageLocation?: 'cloud' | 'local';
  defaultFileOpening?: 'lastEdited' | 'firstFile' | 'fileList';
  defaultSorting?: 'modifiedTime' | 'alphabetical' | 'fileSize';
  [key: string]: any;
}