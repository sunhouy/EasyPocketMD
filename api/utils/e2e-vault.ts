export {};
const db = require('../config/db');
let schemaPromise;
function ensureSchema() {
    if (!schemaPromise) schemaPromise = (async () => {
        await db.execute(`CREATE TABLE IF NOT EXISTS e2e_vaults (
            username VARCHAR(20) PRIMARY KEY, config_json MEDIUMTEXT NOT NULL, revision INT NOT NULL DEFAULT 1)`);
    })().catch(error => { schemaPromise = null; throw error; });
    return schemaPromise;
}
function validBox(box) {
    return box && typeof box.salt === 'string' && /^[A-Za-z0-9+/=]{24}$/.test(box.salt) &&
        typeof box.iv === 'string' && /^[A-Za-z0-9+/=]{16}$/.test(box.iv) &&
        typeof box.data === 'string' && /^[A-Za-z0-9+/=]{24,4096}$/.test(box.data);
}
function validConfig(c) {
    if (!c || c.version !== 2 || ![60,300,900,1800,3600,14400,86400].includes(c.ttlSeconds) ||
        !validBox(c.check) || Object.keys(c.check).some(k => !['salt','iv','data'].includes(k)) || !c.methods ||
        Object.keys(c).some(k => !['version','ttlSeconds','check','methods'].includes(k)) ||
        Object.keys(c.methods).some(k => !['login','dedicated','passkey'].includes(k))) return false;
    if (!Object.keys(c.methods).length) return false;
    for (const [name, box] of Object.entries(c.methods) as any) {
        if (!validBox(box) || Object.keys(box).some(k => !['salt','iv','data','credentialId','prfSalt'].includes(k))) return false;
        if (name !== 'passkey' && Object.keys(box).some(k => !['salt','iv','data'].includes(k))) return false;
        if (name === 'passkey' && (!/^[A-Za-z0-9+/=]{1,2048}$/.test(box.credentialId) || !/^[A-Za-z0-9+/=]{44}$/.test(box.prfSalt))) return false;
    }
    return JSON.stringify(c).length < 20000;
}

// Ignore the retired field when reading a configuration saved by the previous version.
function normalizeConfig(config) { const { otp: retired, ...active } = config; return active; }
module.exports = { ensureSchema, validConfig, normalizeConfig };
