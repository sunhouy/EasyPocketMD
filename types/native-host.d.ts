export interface NativeFileResponse {
    success?: boolean;
    canceled?: boolean;
    path?: string | null;
    name?: string | null;
    content?: string | null;
    error?: string | null;
    localFileMode?: string | null;
}
export interface NativeCommandMap {
    save_local_file: NativeFileResponse;
    get_local_file_path: string;
    open_local_file_dialog: NativeFileResponse;
    read_local_file: NativeFileResponse;
    write_local_file: NativeFileResponse;
    open_external_url: void;
    get_md_association_enabled: boolean;
    set_md_association_enabled: boolean;
    consume_pending_open_file_path: string | null;
    save_file_with_dialog: string | null;
    'plugin:opener|open_url': void;
}
export interface NativeFs {
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string | {
        path: string;
        contents: string;
    }, contents?: string): Promise<void>;
    writeFile(path: string | {
        path: string;
        contents: Uint8Array;
    }, contents?: Uint8Array): Promise<void>;
    mkdir?(path: string, options?: {
        recursive?: boolean;
    }): Promise<void>;
    createDir?(path: string, options?: {
        recursive?: boolean;
    }): Promise<void>;
}
export interface NativeDialogOptions {
    multiple?: boolean;
    filters?: {
        name: string;
        extensions: string[];
    }[];
    defaultPath?: string;
    title?: string;
}
export interface TauriHost {
    invoke<K extends keyof NativeCommandMap>(command: K, payload?: Record<string, unknown>): Promise<NativeCommandMap[K]>;
    core?: TauriHost;
    plugin?: Pick<TauriHost, 'dialog' | 'fs' | 'opener'>;
    dialog?: {
        open(options?: NativeDialogOptions): Promise<string | string[] | null>;
        save(options?: NativeDialogOptions): Promise<string | null>;
    };
    fs?: NativeFs;
    opener?: {
        openUrl(url: string): Promise<void>;
    };
    event?: {
        listen(name: string, handler: (event: {
            payload: unknown;
        }) => void): Promise<() => void>;
    };
    window?: {
        getCurrentWindow(): {
            onCloseRequested(handler: (event: {
                preventDefault(): void;
            }) => void): Promise<() => void>;
            close(): Promise<void>;
            onFocusChanged(handler: (event: {
                payload: boolean;
                focused?: boolean;
            }) => void): Promise<() => void>;
        };
    };
}
export interface DesktopBridge {
    isTauri?: boolean;
    isElectron?: boolean;
    onOpenLocalFileRequest(handler: (path: string) => void): void;
    saveLocalFile(name: string, content: string): Promise<NativeFileResponse>;
    getLocalFilePath(name: string): Promise<string>;
    openLocalFileDialog(): Promise<NativeFileResponse>;
    readLocalFile(filePath: string): Promise<NativeFileResponse>;
    writeLocalFile(filePath: string, content: string): Promise<NativeFileResponse>;
    openExternalUrl(url: string): Promise<void>;
    getMdAssociationEnabled(): Promise<boolean>;
    setMdAssociationEnabled(enabled: boolean): Promise<boolean>;
    consumePendingOpenFilePath(): Promise<string | null>;
    ipcRenderer?: {
        on(event: string, listener: (...args: unknown[]) => void): void;
        removeAllListeners(event?: string): void;
    };
}
