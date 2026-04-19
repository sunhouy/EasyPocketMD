const db = require('../config/db');
const historyManager = require('./HistoryManager');
const Cache = require('../utils/cache');
const crypto = require('crypto');

interface FileData {
    name: string;
    content: string;
    content_version: number;
    last_modified: string;
}

interface UserFilesResult {
    username: string;
    files: FileData[];
    count: number;
}

interface OptimisticLock {
    base_content_version?: number | string | null;
    base_last_modified?: string | number | null;
    base_hash?: string | null;
}

interface ApiResponse<T = unknown> {
    code: number;
    message: string;
    data?: T;
}

class FileManager {
    computeContentHash(content = ''): string {
        return crypto.createHash('sha256').update(String(content), 'utf8').digest('hex');
    }

    toTimestampMillis(value: unknown): number | null {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        const parsed = Date.parse(String(value));
        return Number.isNaN(parsed) ? null : parsed;
    }

    normalizeDbLastModified(value: unknown): string | null {
        const ms = this.toTimestampMillis(value);
        return ms === null ? null : new Date(ms).toISOString();
    }

    // Get user files
    async getUserFiles(username: string): Promise<ApiResponse<UserFilesResult>> {
        try {
            // Try to get from cache first
            const cached = await Cache.getUserFiles(username);
            const isCachedVersionShapeValid = !!(
                cached &&
                (!Array.isArray(cached.files) || cached.files.every((file: FileData) => {
                    if (!file) return false;
                    if (!Object.prototype.hasOwnProperty.call(file, 'content_version')) return false;
                    const v = Number(file.content_version);
                    return Number.isFinite(v) && v > 0;
                }))
            );
            if (cached && isCachedVersionShapeValid) {
                return {
                    code: 200,
                    message: '获取文件列表成功 (缓存)',
                    data: cached as UserFilesResult
                };
            }

            if (cached && !isCachedVersionShapeValid) {
                await Cache.deleteUserFiles(username);
            }

            const [rows] = await db.execute(
                'SELECT filename, content, last_modified, content_version FROM user_files WHERE username = ? ORDER BY last_modified DESC',
                [username]
            );

            const files = (rows as Array<{ filename: string; content: string; content_version: number; last_modified: string }>).map(row => ({
                name: row.filename,
                content: row.content,
                content_version: row.content_version,
                last_modified: row.last_modified
            }));

            const result: UserFilesResult = {
                username,
                files,
                count: files.length
            };

            // Cache the result
            await Cache.setUserFiles(username, result);

            return {
                code: 200,
                message: '获取文件列表成功',
                data: result
            };
        } catch (error) {
            return { code: 500, message: '获取文件列表失败: ' + (error as Error).message };
        }
    }

    // Get file content
    async getFileContent(username: string, filename: string): Promise<ApiResponse<FileData>> {
        try {
            // Try to get from cache first
            const cached = await Cache.getFileContent(username, filename);
            if (cached) {
                return {
                    code: 200,
                    message: '获取文件内容成功 (缓存)',
                    data: cached as FileData
                };
            }

            const [rows] = await db.execute(
                'SELECT filename, content, last_modified, content_version FROM user_files WHERE username = ? AND filename = ?',
                [username, filename]
            );

            if ((rows as Array<unknown>).length === 0) {
                return { code: 404, message: '文件不存在' };
            }

            const row = (rows as Array<{ filename: string; content: string; content_version: number; last_modified: string }>)[0];
            const result: FileData = {
                filename: row.filename,
                content: row.content,
                content_version: row.content_version,
                last_modified: row.last_modified
            };

            // Cache the result
            await Cache.setFileContent(username, filename, result);

            return {
                code: 200,
                message: '获取文件内容成功',
                data: result
            };
        } catch (error) {
            return { code: 500, message: '获取文件内容失败: ' + (error as Error).message };
        }
    }

    // Save file
    async saveFile(username: string, filename: string, content = '', optimisticLock: OptimisticLock = {}): Promise<ApiResponse> {
        try {
            const connection = await db.getConnection();
            try {
                const beginTransaction = typeof connection.beginTransaction === 'function'
                    ? connection.beginTransaction.bind(connection)
                    : null;
                const commit = typeof connection.commit === 'function'
                    ? connection.commit.bind(connection)
                    : null;
                const rollback = typeof connection.rollback === 'function'
                    ? connection.rollback.bind(connection)
                    : null;

                if (beginTransaction) {
                    await beginTransaction();
                }
                // Check if file exists
                const [rows] = await connection.execute(
                    'SELECT id, content, last_modified, content_version FROM user_files WHERE username = ? AND filename = ? FOR UPDATE',
                    [username, filename]
                );

                const hasBaseVersion = optimisticLock.base_content_version !== undefined && optimisticLock.base_content_version !== null && optimisticLock.base_content_version !== '';
                const hasBaseLastModified = optimisticLock.base_last_modified !== undefined && optimisticLock.base_last_modified !== null && optimisticLock.base_last_modified !== '';
                const hasBaseHash = typeof optimisticLock.base_hash === 'string' && optimisticLock.base_hash.trim() !== '';
                const shouldCheckOptimisticLock = hasBaseVersion || hasBaseLastModified || hasBaseHash;

                if ((rows as Array<unknown>).length > 0 && shouldCheckOptimisticLock) {
                    const existing = (rows as Array<{ content: string; last_modified: string; content_version: number }>)[0];
                    const serverLastModifiedMs = this.toTimestampMillis(existing.last_modified);
                    const baseLastModifiedMs = this.toTimestampMillis(optimisticLock.base_last_modified);
                    const serverHash = this.computeContentHash(existing.content || '');
                    const baseHash = hasBaseHash ? optimisticLock.base_hash!.trim() : null;
                    const baseVersion = hasBaseVersion ? Number(optimisticLock.base_content_version) : null;

                    const versionMismatch = hasBaseVersion && Number.isFinite(baseVersion) && Number(existing.content_version || 0) !== baseVersion;
                    const timestampMismatch = !hasBaseVersion && hasBaseLastModified && baseLastModifiedMs !== null && serverLastModifiedMs !== null && baseLastModifiedMs !== serverLastModifiedMs;
                    const hashMismatch = hasBaseHash && baseHash !== serverHash;

                    if (versionMismatch || timestampMismatch || hashMismatch) {
                        if (rollback) {
                            await rollback();
                        }
                        return {
                            code: 409,
                            message: '文件已被其他设备更新，请先同步后再保存',
                            data: {
                                username,
                                filename,
                                server_content_version: Number(existing.content_version || 0),
                                server_last_modified: this.normalizeDbLastModified(existing.last_modified),
                                server_hash: serverHash,
                                server_content: existing.content || ''
                            }
                        };
                    }
                }

                let message: string;
                if ((rows as Array<unknown>).length > 0) {
                    await connection.execute(
                        'UPDATE user_files SET content = ?, last_modified = NOW(), content_version = content_version + 1 WHERE username = ? AND filename = ?',
                        [content, username, filename]
                    );
                    const nextVersion = Number((rows as Array<{ content_version: number }>)[0].content_version || 0) + 1;
                    message = '文件更新成功';
                    if (commit) {
                        await commit();
                    }

                    // Invalidate cache after successful save
                    await Cache.deleteUserFiles(username);
                    await Cache.deleteFileContent(username, filename);

                    return {
                        code: 200,
                        message,
                        data: {
                            username,
                            filename,
                            content_length: Buffer.byteLength(content, 'utf8'),
                            content_version: nextVersion,
                            last_modified: new Date().toISOString()
                        }
                    };
                } else {
                    await connection.execute(
                        'INSERT INTO user_files (username, filename, content, content_version, last_modified) VALUES (?, ?, ?, 1, NOW())',
                        [username, filename, content]
                    );
                    message = '文件保存成功';
                    if (commit) {
                        await commit();
                    }

                    // Invalidate cache after successful save
                    await Cache.deleteUserFiles(username);
                    await Cache.deleteFileContent(username, filename);

                    return {
                        code: 200,
                        message,
                        data: {
                            username,
                            filename,
                            content_length: Buffer.byteLength(content, 'utf8'),
                            content_version: 1,
                            last_modified: new Date().toISOString()
                        }
                    };
                }
            } finally {
                connection.release();
            }
        } catch (error) {
            return { code: 500, message: '保存文件失败: ' + (error as Error).message };
        }
    }

    // Save file with history
    async saveFileWithHistory(username: string, filename: string, content: string, createHistory = false, optimisticLock: OptimisticLock = {}): Promise<ApiResponse> {
        try {
            const result = await this.saveFile(username, filename, content, optimisticLock);

            if (result.code !== 200) {
                return result;
            }

            // Invalidate cache after successful save
            await Cache.deleteUserFiles(username);
            await Cache.deleteFileContent(username, filename);

            if (createHistory) {
                const historyResult = await historyManager.createHistory(username, filename, content);
                if (historyResult.code !== 200 && historyResult.code !== 304) {
                    console.error(`History creation failed for ${username}/${filename}: ${historyResult.message}`);
                }
            }

            return result;
        } catch (error) {
            return { code: 500, message: '保存文件失败: ' + (error as Error).message };
        }
    }

    // Delete file
    async deleteFile(username: string, filename: string): Promise<ApiResponse> {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Check if file exists
            const [rows] = await connection.execute(
                'SELECT id FROM user_files WHERE username = ? AND filename = ?',
                [username, filename]
            );

            if ((rows as Array<unknown>).length === 0) {
                await connection.rollback();
                return { code: 404, message: '文件不存在' };
            }

            // Delete from user_files
            const [deleteResult] = await connection.execute(
                'DELETE FROM user_files WHERE username = ? AND filename = ?',
                [username, filename]
            );

            // Delete history
            // We can reuse historyManager logic but we are inside a transaction here.
            // So reimplement logic or use helper.
            // Since HistoryManager uses separate connection/transaction, better to do it manually here
            // or pass connection if supported.
            // For simplicity, let's just execute DELETEs directly as in PHP
            
            // Get user ID for history deletion
            const [userRows] = await connection.execute('SELECT id FROM users WHERE username = ?', [username]);
            if ((userRows as Array<unknown>).length > 0) {
                const userId = (userRows as Array<{ id: number }>)[0].id;
                
                // Delete content
                await connection.execute(`
                    DELETE c FROM file_content c
                    JOIN file_history h ON c.history_id = h.id
                    WHERE h.user_id = ? AND h.filename = ?
                `, [userId, filename]);
                
                // Delete history
                await connection.execute(
                    'DELETE FROM file_history WHERE user_id = ? AND filename = ?',
                    [userId, filename]
                );
            }

            await connection.commit();

            // Invalidate cache after successful delete
            await Cache.deleteUserFiles(username);
            await Cache.deleteFileContent(username, filename);

            return {
                code: 200,
                message: '文件删除成功',
                data: {
                    filename,
                    affected_rows: (deleteResult as { affectedRows: number }).affectedRows
                }
            };

        } catch (error) {
            await connection.rollback();
            return { code: 500, message: '删除文件失败: ' + (error as Error).message };
        } finally {
            connection.release();
        }
    }

    // Sync files
    async syncFiles(username: string, files: Array<{ name?: string; content?: string }>): Promise<ApiResponse> {
        const connection = await db.getConnection();
        let successCount = 0;
        const errorFiles: Array<{ filename: string; error: string }> = [];

        try {
            await connection.beginTransaction();

            for (const file of files) {
                const filename = file.name || '';
                const content = file.content || '';

                if (!filename) {
                    errorFiles.push({ filename: 'unknown', error: '缺少文件名' });
                    continue;
                }

                try {
                    const [rows] = await connection.execute(
                        'SELECT id FROM user_files WHERE username = ? AND filename = ?',
                        [username, filename]
                    );

                    if ((rows as Array<unknown>).length > 0) {
                        await connection.execute(
                            'UPDATE user_files SET content = ?, last_modified = NOW() WHERE username = ? AND filename = ?',
                            [content, username, filename]
                        );
                    } else {
                        await connection.execute(
                            'INSERT INTO user_files (username, filename, content, last_modified) VALUES (?, ?, ?, NOW())',
                            [username, filename, content]
                        );
                    }
                    successCount++;
                } catch (err) {
                    errorFiles.push({ filename, error: (err as Error).message });
                }
            }

            await connection.commit();

            // Invalidate all user file caches after sync
            await Cache.invalidateUserFiles(username);

            return {
                code: 200,
                message: '文件同步完成',
                data: {
                    username,
                    total: files.length,
                    success: successCount,
                    failed: errorFiles.length,
                    errors: errorFiles
                }
            };

        } catch (error) {
            await connection.rollback();
            return { code: 500, message: '同步文件失败: ' + (error as Error).message };
        } finally {
            connection.release();
        }
    }
}

export = new FileManager();
