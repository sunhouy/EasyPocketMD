export function isExternalLocalFile(file: any): boolean {
  return !!(file && file.type === 'file' && file.isExternalLocal);
}

export function normalizeExternalLocalFileRecord(globalRef: any, file: any): void {
  if (!isExternalLocalFile(file)) return;
  file.isSynced = false;
  if (!file.localFileMode) {
    file.localFileMode = globalRef.electron ? 'electron' : 'browser-file';
  }
}

export function getPathBasename(globalRef: any, filePath: string): string {
  return globalRef.wasmTextEngineGateway.pathBasename(filePath || '');
}

export function createBrowserLocalPath(fileName: string): string {
  return `browser://${encodeURIComponent(fileName || `local-${Date.now()}`)}`;
}

export function isLikelyBrowserWritePermissionError(error: any): boolean {
  if (!error) return false;
  const name = String(error.name || '');
  const message = String(error.message || '');
  return (
    name === 'NotAllowedError' ||
    name === 'SecurityError' ||
    name === 'NoModificationAllowedError' ||
    message.includes('permission') ||
    message.includes('denied')
  );
}
