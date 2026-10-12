# Android native UI

Kotlin sources in this directory are the maintained Android implementation. `scripts/apply-android-config.sh` copies them into the Tauri-generated Android project and preserves argument classes used by reflection. Edit these sources rather than generated copies.

The first migration includes native alert/confirmation/input dialogs, file and folder details, and the complete calendar editor with system date/time pickers. The calendar provider, clipboard, local document access, and permissions already run in Kotlin. The Markdown editor, file synchronization, and account subflows still use the shared web implementation; the file home, settings form and top toolbar now render natively.

The frontend sends plain document text to `calendar_action: showTodo`. Kotlin owns calendar selection, dates, recurrence validation and provider writes on the I/O executor. Calendar permissions are requested only on opening the calendar editor. No alarms or reminder records are created. Dialog sessions resolve once on completion, Back/cancellation or activity destruction. Generic dialogs retain the existing web fallback when an older Android host lacks the native command.

Native UI uses Android light/dark dialog themes according to the app's current mode. Document text is passed as strings, not injected into HTML.

After `npm run tauri:android:init`, run `bash scripts/apply-android-config.sh` and `bash scripts/configure-android-permissions.sh` before building the APK. The Android build workflows already run these scripts.

For the platform-independent recurrence checks, compile `CalendarRecurrence.kt` and `tests/native/CalendarRecurrenceTest.kt` with `kotlinc`, then run `cn.yhsun.md.CalendarRecurrenceTestKt`. APK/device validation should also cover Back, rotation, keyboard resizing, refused calendar permission, calendar deletion during editing, and retry after a failed save.

## Material workspace and Back routing

The Android file home, More/create menus, and settings form are now rendered by Kotlin. NativeMaterial uses Material Components widgets and the same semantic colors as `css/material.css`, passed by the web adapter to honor custom themes. Material Icons are bundled with their Apache 2.0 license. File cards are recycled by a ListView adapter; settings groups build child controls only when expanded. Unchanged home snapshots and text-only settings edits avoid rebuilding native views.

`android-workspace.ts` sends display data and opaque control keys. Native edits/clicks delegate to the existing file/settings handlers, retaining validation, persistence, sync, and cancellation logic. No editor/document body is transferred for this list; snippets and metadata only. Shared web dialogs remain available for specialized subflows, and unsupported older native hosts retain the web UI.

The generated activity disables Wry's direct WebView history navigation and registers an AndroidX Back callback. Native dialogs consume their own Back; settings cancellation is routed through the existing unsaved-change checks. The file home consumes selection cancellation and folder navigation before calling the application router. That router closes transient surfaces, exits selection, returns to the list, and requires a second Back at the root to move the task to the background. Resume clears the pending second-Back timer; MainActivity uses singleTask to reuse the same Wry/NDK runtime. The generated TauriActivity and its plugin lifecycle/ActivityResult launchers are preserved. SDK 33+ dialog Back callbacks and legacy key events use the same cancellation path.

Native view acknowledgement controls web surface hiding, so a missing command cannot leave a blank page. Activity destruction releases the workspace and Back dispatch state. Account epochs discard stale native actions. Rebuilding/reinstalling the Android APK is required for these Kotlin and resource changes.

The native home follows the mobile web metrics: 16dp side padding, 14dp grid gaps, two 224dp card columns, 24sp title, single-line search placeholder and separate section/setting-row hierarchy. Folder tabs retain filtering and multi-selection states; horizontal swipes across the list switch adjacent folders without moving files or interrupting vertical scroll. Native toolbar acknowledgement hides only the web toolbar controls, retaining the editor's reserved top space. More uses two-column icon/text rows and grouped actions.

Import uses Android ACTION_OPEN_DOCUMENT with multiple selection and read-only session grants, preserving binary bytes before delegating to the shared Markdown/Office/PDF importer. The bridge currently limits each import to 50 documents and 20 MiB total. Cancel performs no import; read failures are reported. Older APKs retain the WebView file picker. Device validation must cover light/dark themes, 320/390dp widths, scaled fonts, IME, multi-select Back, folder swipes, binary/multiple imports, and repeated background/re-entry; an unsymbolicated native crash report alone cannot prove all crash paths resolved.

Native-owned base chrome and settings remain hidden in the WebView while web child surfaces are open. Text selection/floating menus do not hand base ownership back to the web renderer. About, word count, export, share, cloud printing and AI use the original shared web interfaces. Their native panel renderer has been removed; the adapter sends an empty panel list to dismiss panels in an older installed host.

Settings use a bounded dialog with a weighted scrolling body and reserved 60dp footer. Its web action row is excluded from the native body so only the native footer exposes Save. Rounded native click surfaces use RippleDrawable; MaterialButton uses its own rippleColor. The native title bar retains the live end-to-end-encryption indicator. File-home selection is derived from data rather than hidden/cleared DOM cards; filtered views retain their selection scope. Device QA must cover settings save/cancel, web child dialog transitions and selecting all in the native home.
