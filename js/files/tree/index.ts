export function normalizePath(globalRef: any, input: string): string {
  return globalRef.wasmTextEngineGateway.normalizePath(input || '');
}

export function getParentPath(globalRef: any, path: string): string {
  return globalRef.wasmTextEngineGateway.parentPath(path || '');
}

export function getBasename(globalRef: any, path: string): string {
  return globalRef.wasmTextEngineGateway.basenamePath(path || '');
}

export function getAllFolderPaths(globalRef: any, files: any[]): string[] {
  const payload = (files || [])
    .map((file) => {
      const type = file && file.type ? String(file.type) : '';
      const name = file && file.name ? String(file.name).replace(/[\n\t]/g, ' ') : '';
      return `${type}\t${name}`;
    })
    .join('\n');
  return globalRef.wasmTextEngineGateway.collectFolderPaths(payload);
}

export function isWasmFileOpsReady(globalRef: any): boolean {
  if (!globalRef.wasmTextEngineGateway || typeof globalRef.wasmTextEngineGateway.getStatus !== 'function') {
    return true;
  }
  const status = globalRef.wasmTextEngineGateway.getStatus();
  return !!(status && status.ready && !status.disabledByError);
}
