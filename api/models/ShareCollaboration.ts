const db = require('../config/db');
const { undoTextChange } = require('../utils/selectiveUndo');
class ShareCollaboration {
    schemaReady = null;
    async ensureSchema() {
        if (!this.schemaReady) this.schemaReady = (async () => {
            await db.execute(`CREATE TABLE IF NOT EXISTS share_edit_events (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                share_id VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL,
                actor_key VARCHAR(260) COLLATE utf8mb4_unicode_ci NOT NULL,
                actor_name VARCHAR(255) NOT NULL,
                before_content LONGTEXT NOT NULL, after_content LONGTEXT NOT NULL,
                content_version BIGINT UNSIGNED NOT NULL, kind VARCHAR(16) NOT NULL DEFAULT 'edit',
                undone_by BIGINT UNSIGNED NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                INDEX share_events (share_id, id), INDEX share_actor (share_id, actor_key(191)),
                FOREIGN KEY (share_id) REFERENCES file_shares(share_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
            await db.execute(`CREATE TABLE IF NOT EXISTS share_edit_blocks (
                share_id VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL,
                actor_key VARCHAR(260) COLLATE utf8mb4_unicode_ci NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (share_id, actor_key),
                FOREIGN KEY (share_id) REFERENCES file_shares(share_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        })().catch(error => { this.schemaReady = null; throw error; });
        return this.schemaReady;
    }
    actor(options) {
        if (options.editorUsername) return { key: 'user:' + options.editorUsername, name: options.editorUsername };
        const id = String(options.viewerId || '');
        if (!/^[\w:.-]{1,128}$/.test(id)) throw Object.assign(new Error('缺少有效的编辑者会话标识'), { code: 400 });
        return { key: 'guest:' + id, name: String(options.viewerName || 'Guest').slice(0, 251) + '（访客）' };
    }
    async isBlocked(shareId, actorKey, connection = db) {
        await this.ensureSchema();
        const [rows] = await connection.execute('SELECT actor_key FROM share_edit_blocks WHERE share_id = ? AND actor_key = ?', [shareId, actorKey]);
        return rows.length > 0;
    }
    async record(connection, shareId, actor, before, after, version, kind = 'edit') {
        if (before === after) return null;
        const [result] = await connection.execute(`INSERT INTO share_edit_events
            (share_id, actor_key, actor_name, before_content, after_content, content_version, kind)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [shareId, actor.key, actor.name, before, after, version, kind]);
        return result.insertId;
    }
    async list(shareId, options: any = {}) {
        await this.ensureSchema();
        const clauses = ['share_id = ?']; const values: any[] = [shareId];
        if (Number.isSafeInteger(Number(options.before_id)) && Number(options.before_id) > 0) { clauses.push('id < ?'); values.push(Number(options.before_id)); }
        if (options.actor_key) { clauses.push('actor_key = ?'); values.push(String(options.actor_key)); }
        const [events] = await db.execute(`SELECT id, actor_key, actor_name,
            content_version, kind, undone_by, created_at FROM share_edit_events WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT 100`, values);
        const [editors] = await db.execute(`SELECT e.actor_key, MAX(e.actor_name) AS actor_name, COUNT(*) AS edit_count,
            MAX(e.created_at) AS last_edit, MAX(b.actor_key IS NOT NULL) AS blocked
            FROM share_edit_events e LEFT JOIN share_edit_blocks b ON e.share_id = b.share_id AND e.actor_key = b.actor_key
            WHERE e.share_id = ? AND e.kind = 'edit' GROUP BY e.actor_key ORDER BY last_edit DESC`, [shareId]);
        return { events, editors, next_id: events.length === 100 ? events[events.length - 1].id : null };
    }
    async event(shareId, eventId) {
        await this.ensureSchema();
        const [rows] = await db.execute('SELECT before_content, after_content FROM share_edit_events WHERE share_id = ? AND id = ? LIMIT 1', [shareId, eventId]);
        return rows[0] || null;
    }
    async undo(connection, share, owner, eventId, actorKey) {
        const [events] = await connection.execute(`SELECT * FROM share_edit_events
            WHERE share_id = ? AND kind = 'edit' AND undone_by IS NULL AND ${eventId ? 'id = ?' : 'actor_key = ?'} ORDER BY id DESC FOR UPDATE`, [share.share_id, eventId || actorKey]);
        if (!events.length) throw Object.assign(new Error('没有可撤销的编辑记录'), { code: 404 });
        let content = share.content;
        for (const event of events) content = undoTextChange(event.before_content, event.after_content, content);
        const version = Number(share.content_version) + 1;
        const id = await this.record(connection, share.share_id, { key: 'user:' + owner, name: owner }, share.content, content, version, 'undo');
        if (!id) throw Object.assign(new Error('目标改动已不在当前文档中，无需撤销'), { code: 409 });
        await connection.execute('UPDATE user_files SET content = ?, content_version = ?, last_modified = NOW() WHERE username = ? AND filename = ?', [content, version, share.username, share.filename]);
        for (const event of events) await connection.execute('UPDATE share_edit_events SET undone_by = ? WHERE id = ?', [id, event.id]);
        return { content, content_version: version, event_id: id, undone_events: events.map(e => e.id) };
    }
}
module.exports = new ShareCollaboration();
