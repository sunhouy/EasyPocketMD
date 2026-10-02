// Store authenticated wrapped keys only; never receive plaintext E2E keys.
export {};
const express = require('express');
const db = require('../config/db');
const userModel = require('../models/User');
const { verifyTokenOrPassword } = require('../utils/auth');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { ensureSchema, validConfig, normalizeConfig } = require('../utils/e2e-vault');
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
    res.json({ code: 200, data: rows.length ? { config: normalizeConfig(JSON.parse(rows[0].config_json)), revision: rows[0].revision } : { config: null, revision: 0 } });
}));
router.post('/config/save', asyncRoute(async (req, res) => {
    const { username, config, revision } = req.body;
    if (!validConfig(config) || !Number.isInteger(revision) || revision < 0) return res.status(400).json({ code: 400, message_key: 'e2eInvalidConfig' });
    if (!revision) {
        try { await db.execute('INSERT INTO e2e_vaults (username, config_json, revision) VALUES (?, ?, 1)', [username, JSON.stringify(config)]); }
        catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, message_key: 'e2eConfigConflict' }); throw error; }
    } else {
        const [result] = await db.execute('UPDATE e2e_vaults SET config_json = ?, revision = revision + 1 WHERE username = ? AND revision = ?', [JSON.stringify(config), username, revision]);
        if (!result.affectedRows) return res.status(409).json({ code: 409, message_key: 'e2eConfigConflict' });
    }
    res.json({ code: 200, data: { revision: revision + 1 } });
}));
router.use((error, req, res, next) => { console.error('E2E configuration error:', error); res.status(500).json({ code: 500, message_key: 'e2eServiceFailed' }); });
module.exports = router;
module.exports.validConfig = validConfig;
