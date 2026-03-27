# AGENTS.md - AI Coding Agent Guide for EasyPocketMD

A cross-platform Markdown editor with multi-device sync, cloud printing, and rich content support (formulas, diagrams, charts).

## Architecture Overview

**Frontend**: Native JavaScript + Vditor (WYSIWYG MD editor), Capacitor mobile bridges, Electron desktop wrapper
**Backend**: Node.js (Express) replacing original PHP, MySQL database
**Build**: Vite for frontend, GitHub Actions CI/CD, multiplatform outputs (web, Electron, Android APK)
**Data Sync**: Server-side file sync + local IndexedDB cache + conflict resolution

### Critical Data Flow

1. **File Lifecycle**: localStorage (vditor_files) → IndexedDB cache → Server (user_files table) → sync back on app load
2. **Auth**: Login/register stores user in MySQL (bcrypt hashed) → frontend stores in localStorage
3. **Multi-device**: When user logs in, fetch server files; merge with local; track pending syncs to prevent data loss
4. **File Uploads**: Accept POST to `/api/upload_screenshot` or `/api/files/upload`; store in `/screenshots` or `/uploads` directories

## Essential Conventions

### API Response Format
All endpoints return JSON with standard structure:
```javascript
{ code: 200, message: "success message", data: { /* optional payload */ } }
{ code: 401, message: "error message" }  // Auth failures use 401
{ code: 500, message: "error message" }  // Server errors use 500
```
Frontend uses `parseJsonResponse()` in `js/utils.js` to detect HTML responses (404/500 errors) and provide debugging hints.

### Authentication
- Backend: `api/utils/auth.js` provides `verifyPassword()` (bcrypt compare) and legacy `verifyTokenOrPassword()`
- Frontend: `js/auth.js` shows login modal; stores `vditor_user` in localStorage as `{username, is_member, ...}`
- Routes verify via `userModel.login()` before file operations
- Admin: Uses env vars `ADMIN_USER` / `ADMIN_PASSWORD` (fallback: admin/127127sun)

### File Sync State Tracking
Frontend maintains three globals to prevent data loss:
- `window.files`: All local file objects (type: "file" or "folder")
- `window.lastSyncedContent[fileId]`: Previous server state
- `window.unsavedChanges[fileId]`: True if local differs from synced
- `window.pendingServerSync`: Map of fileId→true for unconfirmed saves

When resolving conflicts, check `lastSyncedContent` to determine if server won or local won.

### Database Connection Pattern
`api/config/db.js` exports mysql2 promise pool. All models use:
```javascript
const [rows] = await db.execute('SELECT...', [params]);
// For transactions:
const conn = await db.getConnection();
await conn.beginTransaction();
// ... execute queries ...
await conn.commit(); // or rollback()
conn.release();
```

### File Storage Locations
- User files: `api/uploads/` (general), `api/screenshots/` (images), `api/avatars/` (profile pics)
- Web server: Vite builds to `dist/`, Node serves both `dist/` (SPA) + these static dirs
- Electron: Loads from `dist/index.html`, stores userData in app.getPath('userData')/local_files
- Mobile (Capacitor): Bridges to web bundle running on device/server

## Critical Workflows

### Running Tests
```bash
npm test  # Runs Jest with test env, mocks mysql2, skips pdf generation, forceExit=true
# Test setup in tests/setup.js mocks DB, silence console, set NODE_ENV=test
```
**Key**: All tests use mocked database; see `tests/setup.js` for mocks. Tests import models directly, not via server.

### Development Server
```bash
npm start  # Runs node api/server.js on port 3000 (or $PORT env var)
# Serves: static files (dist/, vditor CDN), uploads, API routes (/api/*)
npm run dev  # Vite frontend dev server, hot reload
# Frontend assumes API at getApiBaseUrl() (localhost:3000/api for local dev)
```

### Building & Deployment
- **Web**: `npm run build` → Vite outputs `dist/` → Git push → GitHub Actions auto-deploys to hosting
- **Electron**: `npm run build:electron:win` or `:linux` → electron-builder outputs to `dist-electron-new/`
- **Android**: `npm run cap:build:android` → Capacitor sync + Android Studio build
- **Version**: `npm run bump-version` runs `version.js` to update `version.json` used for cache busting (sw.js)

### Frontend Internationalization
- `js/translations.js`: Defines all UI strings, `window.i18n.t(key)` retrieves translated text
- Two languages supported; check language object structure before adding new strings

## Project-Specific Patterns

### Global State (js/main.js)
Frontend uses window globals (not a framework state store):
- `window.currentUser`: Logged-in user object or null
- `window.vditor`: Vditor editor instance (wrapped, use `window.vditor.insertValue()`)
- `window.nightMode`: Boolean for theme
- `window.userSettings`: Persisted toolbar config, font size, outline visibility
- `window.allToolbarButtons`: Master list of available button definitions (id, icon, fn, etc.)

### Toolbar Button Pattern
```javascript
{ id: 'buttonId', icon: 'fas fa-icon', textKey: 'translationKey', fn: function() { /* action */ } }
// Settings stores subset: window.userSettings.toolbarButtons = ['buttonId1', 'buttonId2', ...]
```

### Service Worker (sw.js)
- Caches all non-API requests (`/uploads/`, `/api/` excluded)
- Uses version-based cache naming: `md-editor-cache-v1.2.3` from `version.json`
- On activate, deletes old versioned caches

### Legacy PHP Compatibility (api/routes/legacy.js)
Endpoint `/api/index.php` mimics original PHP API responses. Don't break this for existing mobile apps still using old client code.

### Error Handling Expectations
- **Frontend**: Use `global.showMessage(text, 'error')` for user-facing errors; check response.code !== 200
- **Backend**: Catch DB errors and return 500 with sanitized message; don't leak query details to frontend
- **Sync**: If pending sync fails, keep in `pendingServerSync` and retry on next manual sync

## Integration Points

### External Dependencies
- **Vditor** (v3.11.2): Markdown WYSIWYG editor, loaded from `/vditor/` static serve; config in `js/main.js`
- **markdown-it + plugins**: LaTeX, mermaid diagrams, task lists (used server-side for HTML generation)
- **pdfmake**: Generate PDFs with Chinese font support (`pdfmake-support-chinese-fonts`)
- **FontAwesome** (v7.2.0): Icon library, loaded from `/fa/` static serve; use class `fas fa-*`
- **Capacitor**: Mobile bridges, provides `window.Capacitor` for feature detection

### AI Feature Integration Points
- **Print Server**: Python server (`print/print_server.py`) runs separately, listens for cloud print jobs
- **Export**: HTML/PDF generation uses backend at `/api/convert/html` or `/api/convert/pdf`
- **History**: File versions stored in `file_history` table with content hashing

## Common File Locations Reference

| Path | Purpose |
|------|---------|
| `js/main.js` | Editor init, global state, Vditor setup |
| `js/files.js` | File CRUD, sync logic, conflict resolution (2091 lines) |
| `js/auth.js` | Login/register modal, user state |
| `js/ui/*.js` | Export, PDF, print, share, upload dialogs |
| `api/routes/legacy.js` | PHP compatibility layer |
| `api/routes/files.js` | File CRUD endpoints |
| `api/models/FileManager.js` | File DB queries |
| `api/models/User.js` | Auth, membership, avatar management |
| `db.sql` | Full schema with 15+ tables (users, file_history, file_shares, etc.) |
| `index.html` | Main SPA entry; hidden modals for login, file dialogs |
| `vite.config.js` | Vite build config, injects version to sw.js at build time |

