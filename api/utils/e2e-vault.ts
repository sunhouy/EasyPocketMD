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
    return !!box && typeof box.salt === 'string' && /^[A-Za-z0-9+/=]{24}$/.test(box.salt) &&
        typeof box.iv === 'string' && /^[A-Za-z0-9+/=]{16}$/.test(box.iv) &&
        typeof box.data === 'string' && /^[A-Za-z0-9+/=]{24,4096}$/.test(box.data);
}
function validConfig(c) {
    return !!c && c.version === 2 && validBox(c.check) && !!c.methods && validBox(c.methods.login) &&
        Object.keys(c).every(k => ['version','ttlSeconds','check','methods'].includes(k)) &&
        Object.keys(c.methods).every(k => k === 'login') &&
        [c.check,c.methods.login].every(box => Object.keys(box).every(k => ['salt','iv','data'].includes(k)));
}
// Existing keys remain readable through the account-password wrapper only.
function normalizeConfig(config) {
    return {version:config.version,ttlSeconds:config.ttlSeconds,check:config.check,methods:config.methods?.login ? {login:config.methods.login} : {}};
}
module.exports = { ensureSchema, validConfig, normalizeConfig };
