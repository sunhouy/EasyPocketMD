export {};
const db = require('../config/db');

/** Existing files have no reliable creation timestamp; preserve NULL rather than invent one. */
async function ensureFileCreatedAt() {
    const [columns] = await db.execute("SHOW COLUMNS FROM user_files LIKE 'created_at'");
    if (!columns.length) {
        try { await db.execute('ALTER TABLE user_files ADD COLUMN created_at TIMESTAMP NULL DEFAULT NULL'); }
        catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
    }
}
module.exports = { ensureFileCreatedAt };
