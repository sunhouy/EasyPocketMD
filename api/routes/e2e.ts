// Store authenticated wrapped keys only; never receive plaintext E2E keys.
export {};
const express = require('express');
const db = require('../config/db');
const userModel = require('../models/User');
const { verifyTokenOrPassword } = require('../utils/auth');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { ensureSchema, normalizeConfig } = require('../utils/e2e-vault');
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
router.use((error, req, res, next) => { console.error('E2E configuration error:', error); res.status(500).json({ code: 500, message_key: 'e2eServiceFailed' }); });
module.exports = router;
