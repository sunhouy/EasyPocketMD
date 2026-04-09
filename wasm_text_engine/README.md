# wasm_text_engine


## 目录结构

- `src/text_engine.cpp`：核心算法实现
- `src/wasm_bindings.cpp`：Emscripten embind 绑定
- `js/text-engine-client.js`：JS 调用适配器
- `tests/smoke_test.cpp`：原生 C++ 冒烟测试
- `scripts/build_wasm.sh`：构建 wasm 产物
- `scripts/run_native_tests.sh`：本地原生测试

## 先跑测试（不依赖 wasm）

```bash
bash wasm_text_engine/scripts/run_native_tests.sh
```

## 构建 WASM（需要 emsdk/em++）

```bash
bash wasm_text_engine/scripts/build_wasm.sh
```

构建后产物：

- `wasm_text_engine/dist/text_engine.js`
- `wasm_text_engine/dist/text_engine.wasm`

可选冒烟验证（需先构建 wasm）：

```bash
node wasm_text_engine/tests/wasm_smoke.mjs
```

## JS 侧调用示例

```javascript
import { WasmTextEngineClient } from './wasm_text_engine/js/text-engine-client.js';

const client = new WasmTextEngineClient();
await client.init();

const diff = client.diff('a\nb', 'a\nc');
const merge = client.merge3('base', 'local', 'remote', 'manual');

client.indexDocument('f1', 'hello markdown');
const search = client.search('markdown', { limit: 10, caseSensitive: false, wholeWord: false });
```

## 对接

1. 在 `js/files.js` 增加能力探测开关（例如 `window.useWasmTextEngine`）。
2. 仅替换差异计算、冲突合并、全文搜索路径；失败时回退原逻辑。
3. 稳定后再将本目录产物并入主构建流程。

当前已接入（灰度）：

- `js/wasm-text-engine-gateway.js`：网关与回退
- `js/files.js`：`computeDiff`、冲突合并预览、查找对话框中的跨文件搜索
- `vite.config.js`：仅在 `wasm_text_engine/dist/text_engine.js` 存在时复制 wasm 产物

启用方式（测试环境）：

```javascript
localStorage.setItem('vditor_enable_wasm_text_engine', 'true');
location.reload();
```

发布前避免 `404 /wasm_text_engine/text_engine.js`：

```bash
npm run wasm:text:build
npm run build
```

然后确认发布目录包含：

- `dist/wasm_text_engine/text_engine.js`
- `dist/wasm_text_engine/text_engine.wasm`


