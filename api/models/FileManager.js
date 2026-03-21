const db = require('../config/db');
const historyManager = require('./HistoryManager');

class FileManager {
    // Get user files
    async getUserFiles(username) {
        try {
            const [rows] = await db.execute(
                'SELECT filename, content, last_modified FROM user_files WHERE username = ? ORDER BY last_modified DESC',
                [username]
            );

            const files = rows.map(row => ({
                name: row.filename,
                content: row.content,
                last_modified: row.last_modified
            }));

            return {
                code: 200,
                message: '获取文件列表成功',
                data: {
                    username,
                    files,
                    count: files.length
                }
            };
        } catch (error) {
            return { code: 500, message: '获取文件列表失败: ' + error.message };
        }
    }

    // Get file content
    async getFileContent(username, filename) {
        try {
            const [rows] = await db.execute(
                'SELECT filename, content, last_modified FROM user_files WHERE username = ? AND filename = ?',
                [username, filename]
            );

            if (rows.length === 0) {
                return { code: 404, message: '文件不存在' };
            }

            const row = rows[0];
            return {
                code: 200,
                message: '获取文件内容成功',
                data: {
                    filename: row.filename,
                    content: row.content,
                    last_modified: row.last_modified
                }
            };
        } catch (error) {
            return { code: 500, message: '获取文件内容失败: ' + error.message };
        }
    }

    // Save file
    async saveFile(username, filename, content = '') {
        try {
            const connection = await db.getConnection();
            try {
                // Check if file exists
                const [rows] = await connection.execute(
                    'SELECT id FROM user_files WHERE username = ? AND filename = ?',
                    [username, filename]
                );

                let message;
                if (rows.length > 0) {
                    await connection.execute(
                        'UPDATE user_files SET content = ?, last_modified = NOW() WHERE username = ? AND filename = ?',
                        [content, username, filename]
                    );
                    message = '文件更新成功';
                } else {
                    await connection.execute(
                        'INSERT INTO user_files (username, filename, content, last_modified) VALUES (?, ?, ?, NOW())',
                        [username, filename, content]
                    );
                    message = '文件保存成功';
                }

                return {
                    code: 200,
                    message,
                    data: {
                        username,
                        filename,
                        content_length: Buffer.byteLength(content, 'utf8')
                    }
                };
            } finally {
                connection.release();
            }
        } catch (error) {
            return { code: 500, message: '保存文件失败: ' + error.message };
        }
    }

    // Save file with history
    async saveFileWithHistory(username, filename, content, createHistory = false) {
        try {
            const result = await this.saveFile(username, filename, content);

            if (result.code !== 200) {
                return result;
            }

            if (createHistory) {
                const historyResult = await historyManager.createHistory(username, filename, content);
                if (historyResult.code !== 200 && historyResult.code !== 304) {
                    console.error(`History creation failed for ${username}/${filename}: ${historyResult.message}`);
                }
            }

            return result;
        } catch (error) {
            return { code: 500, message: '保存文件失败: ' + error.message };
        }
    }

    // Delete file
    async deleteFile(username, filename) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Check if file exists
            const [rows] = await connection.execute(
                'SELECT id FROM user_files WHERE username = ? AND filename = ?',
                [username, filename]
            );

            if (rows.length === 0) {
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
            if (userRows.length > 0) {
                const userId = userRows[0].id;
                
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

            return {
                code: 200,
                message: '文件删除成功',
                data: {
                    filename,
                    affected_rows: deleteResult.affectedRows
                }
            };

        } catch (error) {
            await connection.rollback();
            return { code: 500, message: '删除文件失败: ' + error.message };
        } finally {
            connection.release();
        }
    }

    // Sync files
    async syncFiles(username, files) {
        const connection = await db.getConnection();
        let successCount = 0;
        const errorFiles = [];

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

                    if (rows.length > 0) {
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
                    errorFiles.push({ filename, error: err.message });
                }
            }

            await connection.commit();

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
            return { code: 500, message: '同步文件失败: ' + error.message };
        } finally {
            connection.release();
        }
    }
}

module.exports = new FileManager();
