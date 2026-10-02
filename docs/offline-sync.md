# Offline synchronization and editor responsiveness

The selected document opens from its local snapshot first. An uncached document requires a content fetch. Workspace discovery does not lock the editor. Other documents run through a coalescing priority queue, with the selected document ahead of other pending work.

Input handlers only mark dirty state and schedule work. Draft extraction is coalesced after 250 ms; cloud autosave runs after 1 s, with a 5 s maximum interval during continuous typing. Switching documents and page visibility/exit events flush the local snapshot. Per-document journals use localStorage and IndexedDB; a full localStorage quota can fall back to IndexedDB. Existing E2E serialization encrypts content, merge bases and retained remote conflict snapshots. File names and native bindings are never restored from a journal, so a draft cannot undo a completed move.

Each file has an icon for syncing, acknowledged, pending upload, remote update, conflict, offline, or offline with edits. Tooltips and accessible labels explain icons. Native/browser sources retain the 本地 label; cloud copies without this device's native binding show 本地非本机. The server stores only an opaque device identifier in `file_local_origins`, keyed by file ID. Folder moves preserve this binding and deletion cascades. The table is included in db.sql and created lazily by authenticated metadata endpoints for existing installations. The DB account needs CREATE TABLE permission for lazy initialization; otherwise apply the db.sql table migration first. Native paths and browser handles stay on the originating device.

A save carries its last acknowledged content version and merge base. The new client requests `conflict_strategy: strict`. Independent changes merge automatically; overlapping replacements, conflicting insertions and divergent revisions without a known base return 409. E2E conflicts merge on the client after decryption, never by combining ciphertext on the server. Both versions survive unresolved conflicts. The fullscreen resolver reuses the Markdown/source diff renderer and offers local, cloud, or manual resolution. New edits made during resolution require reopening the resolver rather than being overwritten. Reconnection immediately starts pending synchronization, followed by metadata discovery. Legacy clients keep the existing merge policy.

Shared documents retain their collaboration save channel. Cursor DOM-to-Markdown conversion runs in a worker and discards stale results. Offscreen paragraphs use content-visibility without removing document content. Read-only surfaces override Vditor's disabled opacity while input guards still prevent changes; selection, scrolling and charts remain available.

## Validation

Chromium, 390 × 844 viewport, 200 Markdown sections (about 13,300 characters), 1,000 workspace files, 40 keystrokes per mode, and an online collaboration session:

| Mode | Input-to-next-frame p95 | Largest Event Timing interaction |
| --- | ---: | ---: |
| WYSIWYG | 32.2 ms | 80 ms |
| Instant rendering | 34.7 ms | 112 ms |
| Source | 8.0 ms | 16 ms |

These are laboratory measurements, not production field INP. At 4× CPU slowdown, p95 remained below 200 ms but isolated interactions exceeded 200 ms (432–488 ms). The target therefore still needs field verification on the user's devices, particularly slow hardware and large documents. Real-editor checks also verified read-only opacity 1, zero overlays, rejected input, same-mode cursor positions and cross-mode cursors.
