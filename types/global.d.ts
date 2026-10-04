import type Vditor from '@sunhouyun/vditor';
export type MessageType = 'info' | 'error' | 'success' | 'warning';
export type SyncStatusType = 'syncing' | 'success' | 'error';
export interface ApiResponse<T = unknown> {
    code: number;
    message?: string;
    data?: T;
    sensitive_words?: string[];
    sensitive_field?: string;
}
export interface VditorUser {
    username: string;
    is_member?: boolean | number;
    password?: string;
    e2e_enabled?: boolean | number | string;
    user_name?: string;
    name?: string;
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
    init: () => string;
    setLanguage: (language: string) => void;
    has: (key: string) => boolean;
    tOr: (key: string, fallback?: string) => string;
    translate: (root?: Document | Element) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
    getLanguage: () => string;
    translations?: Record<string, string>;
}
export interface DialogOptions {
    title?: string;
    cancelText?: string;
    confirmText?: string;
    dismissible?: boolean;
    closeOnOverlay?: boolean;
    closeOnEsc?: boolean;
    [key: string]: unknown;
}
export interface ActionSheetItem {
    icon?: string;
    text?: string;
    label?: string;
    action?: () => void | Promise<void>;
}
export interface UserSettings {
    toolbarButtons?: string[];
    themeMode?: string;
    uiMode?: string;
    fontSize?: string;
    vditorContentTheme?: string;
    vditorCodeTheme?: string;
    showOutline?: boolean;
    hideBottomToolbarOnKeyboard?: boolean;
    enableDebugMode?: boolean;
    enableSlashCommand?: boolean;
    slashCommandActivationKey?: string;
    mdFileAssociationEnabled?: boolean;
    storageLocation?: string;
    defaultFileOpening?: string;
    defaultSorting?: string;
    keyboardShortcuts?: Record<string, string>;
    [key: string]: unknown;
}
export interface PrintSettings {
    fontFamily?: string;
    fontSize?: string | number;
    lineHeight?: string | number;
    [key: string]: unknown;
}
export interface DesktopRuntime {
    type?: string;
    [key: string]: unknown;
}
declare global {
    interface Document {
        webkitFullscreenElement?: Element;
        msFullscreenElement?: Element;
    }
    interface StorageEstimate {
        usageDetails?: Record<string, number>;
    }
    interface HTMLElement {
        __easypocketmdDirtyBound?: boolean;
        __easypocketmdEnterSoftBreakBound?: boolean;
        epmdCropState?: {
            busy?: boolean;
            dirty?: boolean;
            saved?: boolean;
            confirmingClose?: boolean;
            initialSnapshot?: Record<string, number> | null;
        } | null;
    }
    interface IVditor {
        mode?: 'ir' | 'sv' | 'wysiwyg';
        currentOptions?: IOptions;
    }
    interface JQuery {
        jstree(reference: true): {
            get_node(id: string): {
                text: string;
            };
        };
    }
    interface Window {
        Vditor: typeof Vditor;
        CodeRunner: typeof import("../js/code-runner").CodeRunnerConstructor;
        loginModalTimer?: ReturnType<typeof setTimeout>;
        vditor: Vditor | null;
        vditorReady?: boolean;
        vditorInitPromise?: Promise<Vditor> | null;
        currentUser: VditorUser | null;
        files: VditorFile[];
        currentFileId: string | null;
        nightMode: boolean;
        userSettings: UserSettings;
        allToolbarButtons: ToolbarButtonDef[];
        lastSyncedContent: Record<string, string>;
        unsavedChanges: Record<string, boolean>;
        pendingServerSync: Record<string, boolean>;
        i18n: I18nApi;
        isMobileEditorEnvironment?: boolean;
        editorInterfaceMode?: 'mobile' | 'desktop';
        isTauriMobileEnvironment?: boolean;
        desktopRuntime?: DesktopRuntime;
        __TAURI__?: import('./native-host').TauriHost;
        useWasmTextEngine?: boolean;
        wasmTextEngineGateway: typeof import('../js/wasm-text-engine-gateway').wasmGatewayApi;
        initInlineImageTools?: () => void;
        appSessionId: string;
        isLongFileMode?: boolean;
        isFileManagementMode?: boolean;
        fileTree?: JQuery;
        echarts?: typeof import('echarts');
        AIConfig: {
            get: typeof import('../js/ai-config').getAIConfig;
            save: typeof import('../js/ai-config').saveAIConfig;
            isReady: typeof import('../js/ai-config').isAIConfigReady;
            callChat: typeof import('../js/ai-config').callChat;
            callText: typeof import('../js/ai-config').callText;
            syncToCloud: typeof import('../js/ai-config').syncAIConfigToCloud;
            loadFromCloud: typeof import('../js/ai-config').loadAIConfigFromCloud;
            deleteFromCloud: typeof import('../js/ai-config').deleteAIConfigFromCloud;
            normalizeChatUrl: typeof import('../js/ai-config').normalizeChatUrl;
            HIDDEN_FILE_NAME: string;
            STORAGE_KEY: string;
        };
        generatePDF: typeof import('../js/ui/pdf-generator').generatePDF;
        renderPDF: typeof import('../js/ui/pdf-generator').renderPDF;
        EChartsLoader: {
            load(callback?: () => void): void;
        };
        echartsTemplates: {
            name: string;
            nameEn?: string;
            type: string;
            icon: string;
            description?: string;
            keywords?: string[];
            generateOption?: (data: Record<string, string>) => unknown;
            defaultOption: () => unknown;
        }[];
        LazyImageLoader?: {
            processVditorImages(): void;
        };
        appLifecycle?: {
            init(): void;
            emergencySave(reason?: string): void;
            detectEnvironment(): unknown;
            checkAndOfferDraftRecovery(): void;
        };
        defaultToolbarButtons: string[];
        GATUS_ENDPOINT?: string;
        APP_ORIGIN?: string;
        createNewFile: () => void;
        createNewFolder: () => void;
        process?: {
            type?: string;
        };
        showToast?: (message: string, type?: MessageType) => void;
        highlightCodeError?: (view: import('@codemirror/view').EditorView, line: number | null) => void;
        syncCurrentFileWithBeacon?: () => void;
        syncAllFiles?: () => Promise<void>;
        createFileWithContent?: (name: string, content: string) => void | Promise<void>;
        loadFiles?: () => void | Promise<void>;
        clearAutoSave?: () => void;
        startAutoSync?: () => void;
        stopAutoSync?: () => void;
        loadLocalFiles?: () => void;
        loadFilesFromServer?: (preferredName?: string) => Promise<void>;
        hideTopNoticeBanner?: () => void;
        showGuestNoticeBanner?: () => void;
        enterFileManagementMode?: (options?: {
            refresh?: boolean;
        }) => Promise<void> | void;
        enterEditorMode?: () => void;
        ensureVditorInitialized?: () => Promise<import('@sunhouyun/vditor').default>;
        customAlert: (message: string, options?: DialogOptions) => Promise<void>;
        customConfirm: (message: string, options?: DialogOptions) => Promise<boolean>;
        createHistoryVersion: (name: string, content: string) => Promise<number>;
        exportContent: () => void | Promise<void>;
        showShareDialog: () => void | Promise<void>;
        showSettingsDialog: () => void;
        showInsertMenu: () => void;
        importFiles: () => void;
        uploadFiles: (files: File[], insert?: boolean) => Promise<string>;
        hideMobileActionSheet: () => void;
        showUserInfo: () => void;
        showFileManager: () => void;
        showWordCountDialog: () => void;
        showAboutDialog: () => void;
        showServiceStatusDialog: () => void;
        showPrintDialog: (mode?: string, callback?: (settings: PrintSettings) => void | Promise<void>) => void;
        showAILayoutDialog: (content: HTMLElement, cleanup: () => void, modal: HTMLElement) => void;
        generateTableHtml: (headers: string[], rows: string[][], alignment?: string[]) => string;
        handleLoginButtonClick: (event?: Event) => void | Promise<void>;
        toggleNightMode: () => void;
        renderBottomToolbar: () => void;
        showMobileActionSheet: (title: string, options: ActionSheetItem[]) => void;
        bindAddAccountModalEvents: () => void;
        bindSwitchAccountConfirmModalEvents: () => void;
        showNetworkErrorBanner: () => void;
        preparePrintContent: (markdown: string, settings?: PrintSettings) => Promise<string>;
        sendToPrint: (settings: PrintSettings, pdfUrl: string) => Promise<void>;
        triggerImageUpload: () => void;
        triggerFileUpload: () => void;
        exportDOCX: (content: string, settings?: PrintSettings, filename?: string) => Promise<boolean>;
        convertFormulasAndChartsToImages: (html: string, options?: {
            useTempDir?: boolean;
        }) => Promise<string>;
        handleLargeImageUpload: (file: File, options?: {
            quality?: number;
            maxDimension?: number;
        }) => Promise<{
            action: string;
            file: File;
            compressed?: boolean;
            compressionResult?: unknown;
        }>;
        getUser: () => VditorUser | null;
        addRunButtons: (root?: Document | HTMLElement) => void;
        addAccountToList: (username: string, password?: string, token?: string) => void;
        showSwitchAccountConfirm: (username: string) => void;
        confirmSwitchAccount: () => Promise<void>;
        handleAddAccount: () => Promise<void>;
        getCurrentEditorContent: (id?: string, fallback?: string) => string;
        markPendingServerSync: (id: string, pending: boolean) => void;
        __filesCoreHandlers?: Record<string, (...args: unknown[]) => unknown>;
        __easypocketmdFilesCompatLoading?: boolean;
        showMessage: (text: string, type?: MessageType) => void;
        showSyncStatus: (text: string, type?: SyncStatusType) => void;
        showUploadStatus: (message: string, type?: MessageType) => void;
        formatFileSize: (bytes: number) => string;
        escapeHtml: (text: string) => string;
        resolveResourceUrl: (url: string, baseUrl?: string) => string;
        normalizeAppResourceUrl: (url: string) => string;
        removeModal: (modal: string | HTMLElement) => void;
        getApiBaseUrl: () => string;
        getAppOrigin: () => string;
        parseJsonResponse: <T = unknown>(response: Pick<Response, 'text' | 'status'>) => Promise<ApiResponse<T>>;
        authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
        debounce: <A extends unknown[]>(fn: (...args: A) => unknown, wait: number) => (...args: A) => void;
        insertText: (text: string) => void;
        showLoginModal: () => void;
        hideLoginModal: () => void;
        logout: () => void;
        saveCurrentFile?: (manual?: boolean) => void | Promise<void>;
        loadFile?: (fileId: string) => void | Promise<void>;
        showHistoryDiffModal?: (filename: string, versionId: number | string, content: string, timestamp: number | string) => void;
        nativeFileOps: typeof import('../js/native-file').nativeFileApi;
        IndexedDBManager: typeof import('../js/indexedDB').indexedDBApi;
        draftRecovery: typeof import('../js/draftRecovery').draftRecoveryApi;
        ResourceLoader: typeof import('../js/resourceLoader').resourceLoaderApi;
        LocalImageManager: typeof import('../js/localImageManager').localImageApi;
        electron?: import('./native-host').DesktopBridge;
        [key: string]: unknown;
    }
}
export {};
