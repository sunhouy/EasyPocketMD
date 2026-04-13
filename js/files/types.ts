export type SaveStatusKind = 'saving' | 'failed' | 'saved';

export interface PendingServerSyncMap {
  [fileId: string]: boolean;
}

export interface DraftPayload {
  fileId: string;
  fileName: string;
  content: string;
  timestamp: number;
  lastModified: number;
  sessionId: string;
  contentVersion: number;
}
