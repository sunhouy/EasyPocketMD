import { create } from 'zustand';

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
  keyboardShortcuts?: Record<string, string>;
  enableWasmTextEngine?: boolean;
  mdFileAssociationEnabled?: boolean;
  hideBottomToolbarOnKeyboard?: boolean;
  [key: string]: unknown;
}

interface UIState {
  nightMode: boolean;
  userSettings: UserSettings;
  isFileManagementMode: boolean;
  isFileSwitchLoading: boolean;
  toolbarUncertaintyUnlocked: boolean;
  startInFileManagementMode: boolean;
  deferInitialFileOpen: boolean;
  isTauriMobileEnvironment: boolean;
  editorInterfaceMode: 'mobile' | 'desktop';
  setNightMode: (night: boolean) => void;
  setUserSettings: (settings: UserSettings) => void;
  setIsFileManagementMode: (mode: boolean) => void;
  setIsFileSwitchLoading: (loading: boolean) => void;
  setToolbarUncertaintyUnlocked: (unlocked: boolean) => void;
  setStartInFileManagementMode: (start: boolean) => void;
  setDeferInitialFileOpen: (defer: boolean) => void;
  setIsTauriMobileEnvironment: (isMobile: boolean) => void;
  setEditorInterfaceMode: (mode: 'mobile' | 'desktop') => void;
  updateUserSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
}

const loadUserSettings = (): UserSettings => {
  const saved = localStorage.getItem('vditor_settings');
  const defaults: UserSettings = {
    toolbarButtons: [],
    themeMode: 'system',
    fontSize: '16px',
    showOutline: false,
    enableDebugMode: false,
    enableSlashCommand: true,
    slashCommandActivationKey: 'Tab',
    defaultEditorMode: 'wysiwyg',
    language: 'zh',
    uiMode: 'auto',
    storageLocation: 'cloud',
    defaultFileOpening: 'lastEdited',
    defaultSorting: 'modifiedTime',
    enableWasmTextEngine: true,
    mdFileAssociationEnabled: true,
    hideBottomToolbarOnKeyboard: false,
  };
  if (!saved) return defaults;
  try {
    return { ...defaults, ...JSON.parse(saved) };
  } catch {
    return defaults;
  }
};

export const useUIStore = create<UIState>((set) => ({
  nightMode: localStorage.getItem('vditor_night_mode') === 'true',
  userSettings: loadUserSettings(),
  isFileManagementMode: false,
  isFileSwitchLoading: false,
  toolbarUncertaintyUnlocked: localStorage.getItem('vditor_night_mode') === 'true',
  startInFileManagementMode: false,
  deferInitialFileOpen: false,
  isTauriMobileEnvironment: false,
  editorInterfaceMode: 'desktop',

  setNightMode: (night) => {
    localStorage.setItem('vditor_night_mode', String(night));
    set({ nightMode: night });
  },

  setUserSettings: (settings) => {
    localStorage.setItem('vditor_settings', JSON.stringify(settings));
    set({ userSettings: settings });
  },

  setIsFileManagementMode: (mode) => set({ isFileManagementMode: mode }),

  setIsFileSwitchLoading: (loading) => set({ isFileSwitchLoading: loading }),

  setToolbarUncertaintyUnlocked: (unlocked) => {
    localStorage.setItem('vditor_night_mode', String(unlocked));
    set({ toolbarUncertaintyUnlocked: unlocked });
  },

  setStartInFileManagementMode: (start) =>
    set({ startInFileManagementMode: start }),

  setDeferInitialFileOpen: (defer) => set({ deferInitialFileOpen: defer }),

  setIsTauriMobileEnvironment: (isMobile) =>
    set({ isTauriMobileEnvironment: isMobile }),

  setEditorInterfaceMode: (mode) => set({ editorInterfaceMode: mode }),

  updateUserSetting: (key, value) =>
    set((state) => {
      const newSettings = { ...state.userSettings, [key]: value };
      localStorage.setItem('vditor_settings', JSON.stringify(newSettings));
      return { userSettings: newSettings };
    }),
}));