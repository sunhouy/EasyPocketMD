import type Vditor from '@sunhouyun/vditor';

export type MessageType = 'info' | 'error' | 'success' | 'warning';
export type SyncStatusType = 'syncing' | 'success' | 'error';

export interface ApiResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
}

export interface VditorUser {
  username: string;
  is_member?: boolean;
  token?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface VditorFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  parentId?: string | null;
  path?: string;
  modified?: number;
  created?: number;
  [key: string]: unknown;
}

export interface ToolbarButtonDef {
  id: string;
  icon?: string;
  textKey?: string;
  toolbarTextKey?: string;
  fn?: () => void;
  [key: string]: unknown;
}

export interface I18nApi {
  init: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  getLanguage: () => string;
  translations?: Record<string, string>;
}

export interface DesktopRuntime {
  type?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    Vditor: typeof Vditor;
    vditor: Vditor | null;
    vditorReady?: boolean;
    vditorInitPromise?: Promise<Vditor> | null;
    currentUser: VditorUser | null;
    files: VditorFile[];
    currentFileId: string | null;
    nightMode: boolean;
    userSettings: Record<string, unknown>;
    allToolbarButtons: ToolbarButtonDef[];
    lastSyncedContent: Record<string, string>;
    unsavedChanges: Record<string, boolean>;
    pendingServerSync: Record<string, boolean>;
    i18n: I18nApi;
    isMobileEditorEnvironment?: boolean;
    editorInterfaceMode?: 'mobile' | 'desktop';
    isTauriMobileEnvironment?: boolean;
    desktopRuntime?: DesktopRuntime;
    __TAURI__?: unknown;
    useWasmTextEngine?: boolean;
    __filesCoreHandlers?: Record<string, (...args: unknown[]) => unknown>;
    __easypocketmdFilesCompatLoading?: boolean;

    showMessage: (text: string, type?: MessageType) => void;
    showSyncStatus: (text: string, type?: SyncStatusType) => void;
    showUploadStatus: (message: string, type?: MessageType) => void;
    formatFileSize: (bytes: number) => string;
    escapeHtml: (text: string) => string;
    resolveResourceUrl: (url: string, baseUrl?: string) => string;
    normalizeAppResourceUrl: (url: string) => string;
    removeModal: (id: string) => void;
    getApiBaseUrl: () => string;
    getAppOrigin: () => string;
    parseJsonResponse: (response: Response) => Promise<ApiResponse>;
    authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
    debounce: <T extends (...args: unknown[]) => unknown>(fn: T, wait: number) => T;
    insertText: (text: string) => void;

    showLoginModal: () => void;
    hideLoginModal: () => void;
    logout: () => void;
    saveCurrentFile?: () => void | Promise<void>;
    loadFile?: (fileId: string) => void | Promise<void>;
    showDiffModal?: (conflict: unknown) => void;
    [key: string]: unknown;
  }
}

export {};
