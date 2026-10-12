# Android native UI

Kotlin sources in this directory are the maintained Android implementation. `scripts/apply-android-config.sh` copies them into the Tauri-generated Android project and preserves argument classes used by reflection. Edit these sources rather than generated copies.

The first migration includes native alert/confirmation/input dialogs, file and folder details, and the complete calendar editor with system date/time pickers. The calendar provider, clipboard, local document access, and permissions already run in Kotlin. The Markdown editor, file synchronization, account/settings screens, and file list still use the shared web implementation.

The frontend sends plain document text to `calendar_action: showTodo`. Kotlin owns calendar selection, dates, recurrence validation and provider writes on the I/O executor. Calendar permissions are requested only on opening the calendar editor. No alarms or reminder records are created. Dialog sessions resolve once on completion, Back/cancellation or activity destruction. Generic dialogs retain the existing web fallback when an older Android host lacks the native command.

Native UI uses Android light/dark dialog themes according to the app's current mode. Document text is passed as strings, not injected into HTML.

After `npm run tauri:android:init`, run `bash scripts/apply-android-config.sh` and `bash scripts/configure-android-permissions.sh` before building the APK. The Android build workflows already run these scripts.

For the platform-independent recurrence checks, compile `CalendarRecurrence.kt` and `tests/native/CalendarRecurrenceTest.kt` with `kotlinc`, then run `cn.yhsun.md.CalendarRecurrenceTestKt`. APK/device validation should also cover Back, rotation, keyboard resizing, refused calendar permission, calendar deletion during editing, and retry after a failed save.
