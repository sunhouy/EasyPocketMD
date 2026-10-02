// The relay stores wrapped keys and RSA ciphertext only. No plaintext E2E key/password.
export {};
const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const userModel = require('../models/User');
const { verifyTokenOrPassword } = require('../utils/auth');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { ensureSchema, validConfig } = require('../utils/e2e-vault');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
router.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
router.use(async (req, res, next) => {
    try {
        if (!/^[a-zA-Z0-9]{3,20}$/.test(req.body.username || '') || !req.body.token) return res.status(401).json({ code: 401 });
        const auth = await verifyTokenOrPassword(userModel, { username: req.body.username, token: req.body.token });
        if (auth.code !== 200) return res.status(401).json(auth);
        await ensureSchema(); next();
    } catch (error) { next(error); }
});
const asyncRoute = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
router.post('/config', asyncRoute(async (req, res) => {
    const [rows] = await db.execute('SELECT config_json, revision FROM e2e_vaults WHERE username = ?', [req.body.username]);
    res.json({ code: 200, data: rows.length ? { config: JSON.parse(rows[0].config_json), revision: rows[0].revision } : { config: null, revision: 0 } });
}));
router.post('/config/save', asyncRoute(async (req, res) => {
    const { username, config, revision } = req.body;
    if (!validConfig(config) || !Number.isInteger(revision) || revision < 0) return res.status(400).json({ code: 400, message: '无效的加密设置' });
    if (!revision) {
        try { await db.execute('INSERT INTO e2e_vaults (username, config_json, revision) VALUES (?, ?, 1)', [username, JSON.stringify(config)]); }
        catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, message: '设置已更新，请重新载入' }); throw error; }
    } else {
        const [result] = await db.execute('UPDATE e2e_vaults SET config_json = ?, revision = revision + 1 WHERE username = ? AND revision = ?', [JSON.stringify(config), username, revision]);
        if (!result.affectedRows) return res.status(409).json({ code: 409, message: '设置已更新，请重新载入' });
    }
    // Disabling OTP invalidates outstanding requests.
    if (!config.otp) await db.execute('DELETE FROM e2e_pairings WHERE username = ?', [username]);
    res.json({ code: 200, data: { revision: revision + 1 } });
}));
router.post('/pair/create', asyncRoute(async (req, res) => {
    const { username, publicKey } = req.body;
    const [vaults] = await db.execute('SELECT config_json FROM e2e_vaults WHERE username = ?', [username]);
    if (!vaults.length || !JSON.parse(vaults[0].config_json).otp) return res.status(403).json({ code: 403, message: 'OTP 未启用' });
    let key;
    try { key = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), type: 'spki', format: 'der' }); } catch { return res.status(400).json({ code: 400 }); }
    if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength !== 3072) return res.status(400).json({ code: 400 });
    await db.execute('DELETE FROM e2e_pairings WHERE expires_at < ?', [Date.now()]);
    const [pending] = await db.execute('SELECT id FROM e2e_pairings WHERE username = ?', [username]);
    if (pending.length >= 5) return res.status(429).json({ code: 429, message: '请等待已有配对请求过期' });
    const id = crypto.randomBytes(16).toString('hex'), secret = crypto.randomBytes(32).toString('hex');
    const code = String(crypto.randomInt(10000000, 100000000)), expiresAt = Date.now() + 300000;
    await db.execute('INSERT INTO e2e_pairings (id, username, code_hash, secret_hash, public_key, expires_at) VALUES (?, ?, ?, ?, ?, ?)', [id, username, hash(code), hash(secret), publicKey, expiresAt]);
    res.json({ code: 200, data: { id, secret, code, expiresAt } });
}));
router.post('/pair/find', asyncRoute(async (req, res) => {
    if (!/^\d{8}$/.test(req.body.code || '')) return res.status(400).json({ code: 400 });
    const [rows] = await db.execute('SELECT id, public_key FROM e2e_pairings WHERE username = ? AND code_hash = ? AND expires_at > ? AND ciphertext IS NULL', [req.body.username, hash(req.body.code), Date.now()]);
    if (!rows.length) return res.status(404).json({ code: 404, message: '配对码错误或已过期' });
    res.json({ code: 200, data: { id: rows[0].id, publicKey: rows[0].public_key } });
}));
router.post('/pair/approve', asyncRoute(async (req, res) => {
    if (!/^[a-f0-9]{32}$/.test(req.body.id || '') || !/^[A-Za-z0-9+/=]{512}$/.test(req.body.ciphertext || '')) return res.status(400).json({ code: 400 });
    const [result] = await db.execute('UPDATE e2e_pairings SET ciphertext = ? WHERE id = ? AND username = ? AND expires_at > ? AND ciphertext IS NULL', [req.body.ciphertext, req.body.id, req.body.username, Date.now()]);
    res.status(result.affectedRows ? 200 : 409).json({ code: result.affectedRows ? 200 : 409 });
}));
router.post('/pair/consume', asyncRoute(async (req, res) => {
    const { id, secret, username } = req.body;
    if (!/^[a-f0-9]{32}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(secret || '')) return res.status(400).json({ code: 400 });
    // Transaction + row lock makes consumption one-shot across concurrent processes.
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute('SELECT ciphertext FROM e2e_pairings WHERE id = ? AND username = ? AND secret_hash = ? AND expires_at > ? FOR UPDATE', [id, username, hash(secret), Date.now()]);
        const ciphertext = rows[0]?.ciphertext;
        if (ciphertext) await conn.execute('DELETE FROM e2e_pairings WHERE id = ?', [id]);
        await conn.commit();
        res.status(rows.length ? 200 : 410).json({ code: rows.length ? 200 : 410, data: { ciphertext: ciphertext || null } });
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}));
router.use((error, req, res, next) => { console.error('E2E relay error:', error); res.status(500).json({ code: 500, message: '加密服务暂不可用' }); });
module.exports = router;
module.exports.validConfig = validConfig;
