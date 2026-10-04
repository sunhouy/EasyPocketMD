<p align="center"><img src="assets/readme/logo.png" alt="EasyPocketMD" width="160"></p>

# EasyPocketMD

**Turn an idea into a document you can share.**

Write notes, assemble a report, add formulas and diagrams, or keep analysis code beside its results. EasyPocketMD brings these tasks into one Markdown editor. Edit formatted content directly, switch to source whenever you need it, and continue in a browser, desktop app or Android app.

[Try it online](https://md.yhsun.cn/) · [简体中文](README.md) · [Releases](https://github.com/sunhouy/EasyPocketMD/releases) · [Report an issue](https://github.com/sunhouy/EasyPocketMD/issues)

![CI](https://github.com/sunhouy/EasyPocketMD/actions/workflows/deploy.yml/badge.svg)
![License](https://img.shields.io/github/license/sunhouy/EasyPocketMD)

## A workflow for writing, analysis and collaboration

- **Markdown without the friction.** Vditor offers WYSIWYG, instant rendering and split preview. Insert formulas, tables, Mermaid diagrams and ECharts. Code blocks provide line numbers, editable syntax highlighting, language selection, folding and deletion.
- **Keep results with the code.** Run Python in an isolated server Docker sandbox with interactive input, Chinese Matplotlib fonts and common scientific libraries. Upload files or open the file manager and terminal from the code block toolbar. Copy output, download artifacts or insert them into your document. Move, resize, maximize or minimize the output window.
- **Keep writing offline.** Local saving and cloud sync include file status icons and local-file labels. Resolve changes that cannot merge automatically in a two-column diff view; compare and restore history. Access to native local files depends on browser or app permissions.
- **Control how you share.** Choose view-only or editable links, follow collaborator cursors and review editing history. End-to-end encryption protects private documents, with account password, dedicated password or passkey unlock options.
- **Bring your own AI.** Configure a compatible model endpoint for writing, formulas and diagrams. Export a document as a presentation: send the generated prompt to a text model, paste its complete JSON response back, then choose a bundled template and directly download the slides.
- **Make the workspace yours.** Light/dark mode, editor backgrounds, accent colors, outline navigation, word/Token counts and a movable, resizable find-and-replace window. The interface supports Chinese and English.

### Take your work with you

Import Markdown, text or Word documents; export Markdown, text, HTML, PDF, Word, PPT and XLSX. XLSX extracts Markdown tables into separate sheets and preserves the source document. PPT offers seven bundled designs adapted from MIT-licensed templates, with direct download after JSON import. HTML/PDF/Word use left-aligned headings and independent Chinese/English fonts; English defaults to Times New Roman with compatible fallbacks. Server conversion tools support PDF/Word export. Formula, diagram and font rendering depends on the format and conversion engine; review exported layouts. AI, cloud sync, collaboration, Python and some export features require configured services.

## Query all documents with AI

Choose **AI Query** to search cloud documents in every folder, local documents and unsaved drafts. Answers include numbered sources and original excerpts. The default builds an in-memory chunk index across all available documents, then retrieves relevant passages using Chinese/English keywords, query expansion and Markdown/wiki links. Up to three plain-text summarization requests run concurrently; model output never needs to be parsed as JSON. Select **Full scan** to read every chunk; questions requesting summaries of all documents also trigger full scanning.

Use the existing API URL, key and chat model in Settings. An optional **embedding model** supported by the same service enables hybrid keyword/semantic retrieval. The first vector index sends all participating chunks and incurs API usage; later queries update changed chunks only. Without embeddings, the existing chat interface works directly. Cloud text is cached by revision. Indexes and vectors stay in memory and are cleared on account changes or vault locking. Empty responses are retried, reasoning token budgets grow when exhausted, and truncated answers request a continuation. If continuation fails, generated text remains available with an explicit notice.

Document text is sent to the configured AI service. Encrypted documents are excluded unless selected and unlocked; decrypted text then goes to the same service. Hidden configuration files are excluded, and decrypted text is never persisted. Progress, cancellation and unreadable files are displayed. Chunking and incremental indexing are inspired by [Notion's vector search practice](https://www.notion.com/blog/two-years-of-vector-search-at-notion); this application uses a browser memory index, not a separately deployed vector database.

## Companion, theme and local files

The optional **Live2D companion** in Settings is off by default, with nine choices: Shizuku, Koharu, Hibiki, Nico, Haruto, Z16, Hijiki, Tororo and Wanko. SDK and selected model load only after enabling it; model assets use browser Cache Storage. Disabling removes the character and releases runtime resources. Clicking the character opens the all-document AI query input, with no visible caption below the character. The implementation references [l2d-widget](https://github.com/hacxy/l2d-widget); observe the upstream model licenses.

Desktop and mobile theme controls remember light, dark or system mode in a Cookie. Cross-file find results fill the remaining window height and scroll within the result list.

Drag desktop files onto the file list and choose **Import files** to create copies or **Manage local files** to automatically write edits back to originals. Local management supports Markdown/text and requires browser write permission or desktop integration. Some browsers require selecting the same files again to authorize access. The existing autosave debounce and disk conflict checks apply. Other formats use import conversion and do not modify originals when edited.

Uploaded files and images always go to cloud storage. Storage-location settings and prompts are removed. Existing local attachments remain readable and can be manually migrated; image replacement, compression, format conversion and renaming upload the result to the cloud. Attachments in encrypted documents are encrypted before upload.

## Docker deployment: build in CI, run on your server

Production deployment uses Docker. GitHub Actions builds the frontend and app, print, gateway and Python images, then transfers image content over SSH/rsync. **The deployment server does not fetch base images from Docker Hub/GHCR or install npm/pip dependencies**, useful when international downloads are unreliable.

Images are split into compressed, content-addressed objects. Later releases transfer only new or changed objects; unchanged dependency layers can be reused. The first deployment still requires a complete transfer. Removing the server object cache increases the next transfer size.

Deployment verifies digests, checks disk and memory, runs health checks and switches releases with rollback support. Small-memory servers may briefly stop this application's services during import or switching; this is not a zero-downtime guarantee. Existing MySQL, Redis and host TLS services remain in use; user files persist outside the images.

### Before deploying

1. Prepare a Linux amd64 server with Docker Engine, Python, rsync, MySQL, Redis and an Nginx TLS entry point. Aggregate sandbox resource limits require systemd, cgroup v2 and Docker's systemd cgroup driver.
2. Configure database, Redis, JWT, site URL and administrator settings using the [environment variable list](.env.example). Store SSH connection and TLS settings in GitHub Actions secrets. Optional `SSL_EMAIL` supplies a renewal contact address.
3. Run the **CI/CD** workflow with `deploy`; choose `rollback` to download the previous successful release from GitHub Actions artifacts. Each deployment archives images and public metadata as `docker-release-main` / `docker-release-dev` for 90 days; runtime secrets are excluded and regenerated from current Secrets. Expired artifacts or older deployments without an artifact require redeploying the desired Git commit.
4. Obsolete server containers, images, releases and cached layers are cleaned before transfer/import and after activation; only each channel’s current release and its shared layers remain. Back up the database and user files. Automatic TLS renewal still requires working DNS and a reachable HTTP validation endpoint.

See the [deployment guide](deploy/README.md) for server conventions, secrets, incremental transfer, resource budgets and certificates. This workflow targets the repository's existing server layout; adapt paths and Nginx routing for a different environment.

### Python sandbox

Python 3.12 includes data processing, scientific computing, machine learning, image and office-document libraries. See the complete [package list](sandbox/python/requirements.txt). Up to 5 tasks can run concurrently under a shared resource budget. Execution containers have no network access, business-data mounts or Docker socket; the trusted API schedules them.

Uploads and code share a temporary `/tmp/home` directory. Idle sessions expire after 30 minutes, and refreshes or service restarts may lose files. Download important results. To add packages, update the dependency list, rebuild and deploy the sandbox image. See the [sandbox guide](sandbox/python/README.md).

## Local development

Use **Node.js 24**, matching CI. Full backend features also need MySQL and Redis. Native apps need Rust and the platform's Tauri toolchain; complete WASM builds need Emscripten.

```bash
git clone https://github.com/sunhouy/EasyPocketMD.git
cd EasyPocketMD
npm ci
npm run dev
```

`npm run dev` starts frontend development. Backend configuration lives in `api/config/`; use `.env.example` for variables and [db.sql](db.sql) for the schema. Once configured, run `npm start` in another terminal.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Frontend development |
| `npm start` | API server |
| `npm run build:web` | Web build with existing WASM artifacts |
| `npm run build` | Complete Web/WASM build |
| `npm test` | Jest unit and integration tests |
| `npm run typecheck` | TypeScript checks |
| `npm run tauri:dev` | Desktop development |
| `npm run build:tauri:win` / `build:tauri:linux` / `build:tauri:mac` | Platform packages |
| `npm run tauri:android:build` | Android APK |

## Find your way around the code

| Location | Responsibility |
| --- | --- |
| `js/files/` | Files, sync, history and diff editing |
| `js/ui/` | Sharing, export, charts and AI |
| `js/code-*.ts` | Code editing and execution workspace |
| `js/translations.ts`, `js/i18n-messages.ts` | Chinese/English messages and translation API |
| `api/`, `shared/` | Express API, collaboration and shared protocols |
| `sandbox/python/` | Python runner, image and dependencies |
| `deploy/`, `scripts/` | Docker builds, incremental deployment, resource limits and SSL |
| `src-tauri/` | Desktop/Android apps |
| `wasm_text_engine/` | Text/image WASM modules |
| `tests/` | Automated regression coverage |

See [CODE_WIKI.md](CODE_WIKI.md) for more detail and [DEPENDENCIES.md](DEPENDENCIES.md) for dependencies and licenses.

## Contribute

Issues, improvements and pull requests are welcome. Include your platform, reproduction steps and error messages. Use a public minimal example when reporting encrypted-document issues.

EasyPocketMD is [MIT licensed](LICENSE). Thanks to Vditor, CodeMirror, Tauri and the open-source projects that make continued improvements possible.
