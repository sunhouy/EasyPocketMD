import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WasmTextEngineClient } from '../js/text-engine-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.join(__dirname, '../dist/text_engine.js');

if (!fs.existsSync(modulePath)) {
    console.error('wasm artifact missing, run: bash wasm_text_engine/scripts/build_wasm.sh');
    process.exit(1);
}

const client = new WasmTextEngineClient();
const initRes = await client.init({ modulePath: pathToFileURL(modulePath).href });
if (initRes.code !== 200) {
    console.error(initRes.message);
    process.exit(1);
}

console.log(client.diff('a\nb', 'a\nc'));
console.log(client.merge3('x\nbase', 'x\nlocal', 'x\nremote', 'manual'));
console.log(client.analyze('hello\nwasm'));

