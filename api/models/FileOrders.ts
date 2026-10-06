import { normalizeOrders } from '../../shared/file-orders';
const db = require('../config/db');
let schema: Promise<unknown> | undefined;
async function ensureSchema() {
    schema ||= db.execute(`CREATE TABLE IF NOT EXISTS user_file_orders (
        username VARCHAR(191) NOT NULL, filename VARCHAR(255) NOT NULL, sort_order DOUBLE NOT NULL,
        PRIMARY KEY (username, filename)
    )`);
    try {await schema;} catch (error) {schema = undefined;throw error;}
}
export async function getFileOrders(username: string) {
    await ensureSchema();
    const [rows] = await db.execute('SELECT filename, sort_order FROM user_file_orders WHERE username = ?', [username]);
    if (rows.length) return normalizeOrders(Object.fromEntries(rows.map(row => [row.filename, Number(row.sort_order)])));
    // Older clients kept plain JSON metadata in a hidden document. Migrate it once,
    // without changing document versions, histories or conflict baselines.
    const [legacy] = await db.execute('SELECT content FROM user_files WHERE username = ? AND filename IN (?, ?) ORDER BY last_modified DESC', [username, '.easypocketmd_orders', '.easypocketmd_order']);
    for (const row of legacy) {
        let orders;
        try {orders = normalizeOrders(JSON.parse(row.content));}
        catch {continue;} // Encrypted/damaged legacy records are not document text to recover here.
        if (Object.keys(orders).length) {await setFileOrders(username, orders);return orders;}
    }
    return {};

}
export async function setFileOrders(username: string, orders: Record<string, number>) {
    const entries = Object.entries(normalizeOrders(orders));if (!entries.length) return;
    await ensureSchema();
    await db.execute('INSERT INTO user_file_orders (username, filename, sort_order) VALUES ' + entries.map(() => '(?, ?, ?)').join(', ') + ' ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)', entries.flatMap(([path, order]) => [username, path, order]));
}
