// Device identifiers only. Native paths and browser handles never leave their device.
const db = require('../config/db');
let schema: Promise<unknown> | undefined;
async function ensureSchema() {
    schema ||= db.execute(`CREATE TABLE IF NOT EXISTS file_local_origins (
        file_id INT NOT NULL PRIMARY KEY, device_id VARCHAR(64) NOT NULL,
        FOREIGN KEY (file_id) REFERENCES user_files(id) ON DELETE CASCADE
    )`);
    try { await schema; } catch (error) { schema = undefined; throw error; }
}
export async function getLocalOrigins(username: string) {
    await ensureSchema(); const [rows] = await db.execute('SELECT f.filename, o.device_id FROM file_local_origins o INNER JOIN user_files f ON f.id = o.file_id WHERE f.username = ?', [username]); return rows;
}
export async function setLocalOrigin(username: string, filename: string, deviceId: string) {
    await ensureSchema();
    const [rows] = await db.execute('SELECT id FROM user_files WHERE username = ? AND filename = ?', [username, filename]);
    if (!rows.length) throw new Error('File not found');
    await db.execute('INSERT INTO file_local_origins (file_id, device_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE device_id = VALUES(device_id)', [rows[0].id, deviceId]);
}

export async function clearLocalOrigin(username: string, filename: string) {
    await ensureSchema(); await db.execute('DELETE o FROM file_local_origins o INNER JOIN user_files f ON f.id = o.file_id WHERE f.username = ? AND f.filename = ?', [username, filename]);
}
