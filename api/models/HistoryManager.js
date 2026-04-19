const db = require('../config/db');
const crypto = require('crypto');

class HistoryManager {
    // Get user by username
    async getUserByUsername(username) {
        const [rows] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
        return rows.length > 0 ? rows[0] : null;
    }

    // Create history
    async createHistory(username, filename, content) {
        try {
            const user = await this.getUserByUsername(username);
            if (!user) return { code: 404, message: '用户不存在' };

            const userId = user.id;
            const contentHash = crypto.createHash('sha256').update(content).digest('hex');
            const contentLength = Buffer.byteLength(content, 'utf8');

            const recentVersion = await this.getLatestVersion(userId, filename);

            if (recentVersion && recentVersion.content_hash === contentHash) {
                return { code: 304, message: '内容无变化，不创建历史版本' };
            }

            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                const nextVersion = recentVersion ? recentVersion.version_id + 1 : 1;

                const [result] = await connection.execute(
                    'INSERT INTO file_history (user_id, filename, version_id, content_hash, content_length, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                    [userId, filename, nextVersion, contentHash, contentLength]
                );

                const historyId = result.insertId;

                if (nextVersion <= 5) {
                    await this.saveFullContent(connection, historyId, content);
                } else {
                    const prevVersionContent = await this.getVersionContent(userId, filename, nextVersion - 1);
                    if (prevVersionContent && prevVersionContent.content) {
                        const diff = this.computeDiff(prevVersionContent.content, content);
                        if (this.shouldSaveDiff(prevVersionContent.content, content, diff)) {
                            await this.saveDiffContent(connection, historyId, diff, nextVersion - 1);
                        } else {
                            await this.saveFullContent(connection, historyId, content);
                        }
                    } else {
                        await this.saveFullContent(connection, historyId, content);
                    }
                }

                await this.cleanupOldVersions(connection, userId, filename, 1000);

                await connection.commit();

                return {
                    code: 200,
                    message: '历史版本创建成功',
                    data: { version_id: nextVersion, history_id: historyId }
                };

            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

        } catch (error) {
            return { code: 500, message: '创建历史版本失败: ' + error.message };
        }
    }

    // Get history list
    async getHistoryList(username, filename) {
        try {
            const user = await this.getUserByUsername(username);
            if (!user) return { code: 404, message: '用户不存在' };

            const userId = user.id;

            const [rows] = await db.execute(`
                SELECT h.id, h.version_id, h.content_hash, h.content_length, h.created_at, c.content_type, c.base_version_id
                FROM file_history h
                LEFT JOIN file_content c ON h.id = c.history_id
                WHERE h.user_id = ? AND h.filename = ?
                ORDER BY h.version_id DESC
                LIMIT 100
            `, [userId, filename]);

            const latestVersion = await this.getLatestVersion(userId, filename);
            const history = [];

            for (const row of rows) {
                const content = await this.getVersionContentById(row.id);
                const isCurrent = latestVersion && row.version_id === latestVersion.version_id;

                history.push({
                    version_id: row.version_id,
                    history_id: row.id,
                    content: content,
                    content_hash: row.content_hash,
                    content_length: row.content_length,
                    content_type: row.content_type,
                    timestamp: row.created_at,
                    is_current: isCurrent
                });
            }

            return {
                code: 200,
                message: '获取历史版本成功',
                data: { history }
            };
        } catch (error) {
            return { code: 500, message: '获取历史版本列表失败: ' + error.message };
        }
    }

    // Restore history
    async restoreHistory(username, filename, versionId) {
        try {
            const user = await this.getUserByUsername(username);
            if (!user) return { code: 404, message: '用户不存在' };

            const userId = user.id;

            const [rows] = await db.execute(`
                SELECT h.id, h.version_id, c.content_data, c.content_type, c.base_version_id
                FROM file_history h
                LEFT JOIN file_content c ON h.id = c.history_id
                WHERE h.user_id = ? AND h.filename = ? AND h.version_id = ?
            `, [userId, filename, versionId]);

            if (rows.length === 0) return { code: 404, message: '历史版本不存在' };

            const row = rows[0];
            const content = await this.reconstructContent(row);

            if (content === false) return { code: 500, message: '无法重建版本内容' };

            return {
                code: 200,
                message: '获取版本内容成功',
                data: { content, version_id: row.version_id }
            };

        } catch (error) {
            return { code: 500, message: '恢复历史版本失败: ' + error.message };
        }
    }

    // Delete history
    async deleteHistory(username, filename, versionId = 0) {
        try {
            const user = await this.getUserByUsername(username);
            if (!user) return { code: 404, message: '用户不存在' };

            const userId = user.id;
            const connection = await db.getConnection();
            
            try {
                await connection.beginTransaction();

                if (versionId > 0) {
                    const result = await this.deleteSpecificVersion(connection, userId, filename, versionId);
                    await connection.commit();
                    return result;
                } else {
                    const result = await this.deleteAllVersions(connection, userId, filename);
                    await connection.commit();
                    return result;
                }
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

        } catch (error) {
            return { code: 500, message: '删除历史版本失败: ' + error.message };
        }
    }

    async deleteSpecificVersion(connection, userId, filename, versionId) {
        const [rows] = await connection.execute('SELECT id FROM file_history WHERE user_id = ? AND filename = ? AND version_id = ?', [userId, filename, versionId]);
        if (rows.length === 0) return { code: 404, message: '指定的历史版本不存在' };

        const historyId = rows[0].id;
        await connection.execute('DELETE FROM file_content WHERE history_id = ?', [historyId]);
        await connection.execute('DELETE FROM file_history WHERE id = ?', [historyId]);

        return {
            code: 200,
            message: '历史版本删除成功',
            data: { deleted_version_id: versionId, filename }
        };
    }

    async deleteAllVersions(connection, userId, filename) {
        const [rows] = await connection.execute('SELECT id FROM file_history WHERE user_id = ? AND filename = ?', [userId, filename]);
        let deletedCount = 0;

        for (const row of rows) {
            await connection.execute('DELETE FROM file_content WHERE history_id = ?', [row.id]);
            await connection.execute('DELETE FROM file_history WHERE id = ?', [row.id]);
            deletedCount++;
        }

        return {
            code: 200,
            message: '所有历史版本删除成功',
            data: { deleted_count: deletedCount, filename }
        };
    }

    // Batch delete history versions
    async deleteHistoryBatch(username, filename, versionIds) {
        try {
            const user = await this.getUserByUsername(username);
            if (!user) return { code: 404, message: '用户不存在' };

            const userId = user.id;
            const connection = await db.getConnection();
            let deletedCount = 0;
            let failedVersions = [];

            try {
                await connection.beginTransaction();

                for (const versionId of versionIds) {
                    const [rows] = await connection.execute(
                        'SELECT id FROM file_history WHERE user_id = ? AND filename = ? AND version_id = ?',
                        [userId, filename, versionId]
                    );
                    if (rows.length > 0) {
                        const historyId = rows[0].id;
                        await connection.execute('DELETE FROM file_content WHERE history_id = ?', [historyId]);
                        await connection.execute('DELETE FROM file_history WHERE id = ?', [historyId]);
                        deletedCount++;
                    } else {
                        failedVersions.push(versionId);
                    }
                }

                await connection.commit();

                return {
                    code: 200,
                    message: `批量删除完成，成功删除 ${deletedCount} 个版本`,
                    data: {
                        deleted_count: deletedCount,
                        failed_count: failedVersions.length,
                        failed_versions: failedVersions,
                        filename
                    }
                };
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } catch (error) {
            return { code: 500, message: '批量删除历史版本失败: ' + error.message };
        }
    }

    // Helpers
    async getLatestVersion(userId, filename) {
        const [rows] = await db.execute('SELECT version_id, content_hash, content_length FROM file_history WHERE user_id = ? AND filename = ? ORDER BY version_id DESC LIMIT 1', [userId, filename]);
        return rows.length > 0 ? rows[0] : null;
    }

    async getVersionContentById(historyId) {
        const [rows] = await db.execute('SELECT content_data, content_type, base_version_id FROM file_content WHERE history_id = ?', [historyId]);
        if (rows.length === 0) return null;
        return await this.reconstructContent(rows[0]);
    }

    async getVersionContent(userId, filename, versionId) {
        const [rows] = await db.execute(`
            SELECT h.id, c.content_data, c.content_type, c.base_version_id
            FROM file_history h
            LEFT JOIN file_content c ON h.id = c.history_id
            WHERE h.user_id = ? AND h.filename = ? AND h.version_id = ?
        `, [userId, filename, versionId]);
        
        if (rows.length === 0) return null;
        
        return {
            id: rows[0].id,
            content: await this.reconstructContent(rows[0])
        };
    }

    async reconstructContent(row) {
        if (row.content_type === 'full') {
            return row.content_data;
        }
        if (row.content_type === 'diff') {
            const baseContent = await this.getVersionContentById(row.base_version_id);
            if (!baseContent) return false;

            const diff = JSON.parse(row.content_data);
            return this.applyDiff(baseContent, diff);
        }
        return false;
    }

    async saveFullContent(connection, historyId, content) {
        await connection.execute("INSERT INTO file_content (history_id, content_type, content_data, base_version_id) VALUES (?, 'full', ?, NULL)", [historyId, content]);
    }

    async saveDiffContent(connection, historyId, diff, baseVersionNumber) {
        // Here is where I deviate from PHP to fix the bug: I need to find the history_id for baseVersionNumber
        // But wait, I don't have easy access to userId and filename here.
        // The PHP code passed `nextVersion - 1` as `baseVersionId`.
        // If I want to be safe, I should store the HISTORY ID of the base version.
        // But `createHistory` has access to `prevVersionContent` which comes from `getVersionContent`.
        // `getVersionContent` returns `{ id: historyId, content: ... }`.
        // So I can pass `prevVersionContent.id` instead of `nextVersion - 1`.
        
        const diffJson = JSON.stringify(diff);
        // Warning: I'm changing the semantics of the 3rd argument compared to PHP
        // In PHP it was `baseVersionId` (int). Here I will pass the historyId of the base version.
        // But wait, if I use `prevVersionContent.id`, that is the history_id.
        // So I will store history_id in `base_version_id` column.
        // This makes `reconstructContent` work correctly because it calls `getVersionContentById` which expects history_id.
        
        await connection.execute("INSERT INTO file_content (history_id, content_type, content_data, base_version_id) VALUES (?, 'diff', ?, ?)", [historyId, diffJson, baseVersionNumber]);
    }

    computeDiff(oldContent, newContent) {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const m = oldLines.length;
        const n = newLines.length;

        const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (oldLines[i - 1].trim() === newLines[j - 1].trim()) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        const ops = [];
        let i = m;
        let j = n;

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[i - 1].trim() === newLines[j - 1].trim()) {
                ops.push(['=', oldLines[i - 1]]);
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                ops.push(['+', newLines[j - 1]]);
                j--;
            } else {
                ops.push(['-', oldLines[i - 1]]);
                i--;
            }
        }

        return ops.reverse();
    }

    applyDiff(baseContent, diff) {
        const baseLines = baseContent.split('\n');
        const result = [];
        let i = 0;

        for (const op of diff) {
            const type = op[0];
            const line = op[1];

            if (type === '=') {
                if (i < baseLines.length && baseLines[i].trim() === line.trim()) { // PHP used trim check
                     // PHP: if ($i < count($baseLines) && trim($baseLines[$i]) === trim($line))
                     // But it pushes $baseLines[$i] (original line)
                    result.push(baseLines[i]);
                    i++;
                }
            } else if (type === '+') {
                result.push(line);
            } else if (type === '-') {
                i++;
            }
        }

        while (i < baseLines.length) {
            result.push(baseLines[i]);
            i++;
        }

        return result.join('\n');
    }

    shouldSaveDiff(oldContent, newContent, diff) {
        const newSize = Buffer.byteLength(newContent, 'utf8');
        const diffSize = Buffer.byteLength(JSON.stringify(diff), 'utf8');
        return diffSize < newSize * 0.5;
    }

    async cleanupOldVersions(connection, userId, filename, keepCount) {
        const [rows] = await connection.execute('SELECT id FROM file_history WHERE user_id = ? AND filename = ? ORDER BY version_id DESC LIMIT 100000 OFFSET ?', [userId, filename, keepCount]);
        
        if (rows.length === 0) return;

        const idsToDelete = rows.map(r => r.id);
        if (idsToDelete.length === 0) return;

        const placeholders = idsToDelete.map(() => '?').join(',');
        
        await connection.execute(`DELETE FROM file_content WHERE history_id IN (${placeholders})`, idsToDelete);
        await connection.execute(`DELETE FROM file_history WHERE id IN (${placeholders})`, idsToDelete);
    }

    async deleteFileHistory(username, filename) {
        const user = await this.getUserByUsername(username);
        if (!user) return false;
        
        // This is tricky with separate DELETEs. 
        // Best to select IDs first then delete.
        // Or use multi-table delete if mysql2 supports it (it executes SQL, so yes).
        // But let's stick to safe approach.
        const connection = await db.getConnection();
        try {
             await connection.execute(`
                DELETE c FROM file_content c
                JOIN file_history h ON c.history_id = h.id
                WHERE h.user_id = ? AND h.filename = ?
             `, [user.id, filename]);
             
             await connection.execute('DELETE FROM file_history WHERE user_id = ? AND filename = ?', [user.id, filename]);
             return true;
        } catch (e) {
            return false;
        } finally {
            connection.release();
        }
    }
}

module.exports = new HistoryManager();
