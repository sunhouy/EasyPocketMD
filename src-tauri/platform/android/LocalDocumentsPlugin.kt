package cn.yhsun.md

import java.util.ArrayDeque
import android.Manifest
import android.content.ContentProviderOperation
import android.content.ContentValues
import android.provider.CalendarContract
import android.provider.AlarmClock
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.PermissionState
import java.util.TimeZone
import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.provider.DocumentsContract
import java.io.File
import android.net.Uri
import android.provider.OpenableColumns
import android.provider.MediaStore
import java.util.concurrent.Executors
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class SelectionMenuArgs { var enabled: Boolean = false }

@InvokeArg
class StorageArgs { var force: Boolean = false; var checkOnly: Boolean = false }

@InvokeArg
class DocumentArgs {
    lateinit var uri: String
    var content: String = ""
}

@InvokeArg
class CalendarTodoArgs {
    var calendarId:Long=0
    var title:String=""
    var description:String=""
    var start:Long=0
    var end:Long=0
    var rrule:String=""
    var reminderMinutes:Int=-1
    var alarm:Boolean=false
}

/** Shared by MainActivity and the Rust plugin; independent of platform cache paths. */
object IncomingDocuments {
    private val queue = ArrayDeque<String>()
    @Synchronized fun enqueue(uri: String) { queue.addLast(uri) }
    @Synchronized fun consume(): String? = if (queue.isEmpty()) null else queue.removeFirst()
}

/** Reuse persistent grants and, when authorized, shared-storage paths. */
@TauriPlugin(permissions=[Permission(strings=[Manifest.permission.READ_CALENDAR,Manifest.permission.WRITE_CALENDAR],alias="calendar")])
class LocalDocumentsPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun selectionMenu(invoke: Invoke) {
        val args = invoke.parseArgs(SelectionMenuArgs::class.java)
        SelectionMenus.enabled = args.enabled
        activity.runOnUiThread { SelectionMenus.current?.invalidate() }
        invoke.resolve(JSObject().put("enabled", args.enabled))
    }

    private val io = Executors.newSingleThreadExecutor()

    @Command
    fun calendars(invoke:Invoke) {
        if(getPermissionState("calendar")!=PermissionState.GRANTED){requestPermissionForAlias("calendar",invoke,"calendarReady");return}
        io.execute {try {
            val calendars=org.json.JSONArray()
            activity.contentResolver.query(CalendarContract.Calendars.CONTENT_URI,arrayOf(CalendarContract.Calendars._ID,CalendarContract.Calendars.CALENDAR_DISPLAY_NAME),"${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL} >= ? AND ${CalendarContract.Calendars.VISIBLE} = 1",arrayOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR.toString()),null)?.use {cursor->
                while(cursor.moveToNext())calendars.put(JSObject().put("id",cursor.getLong(0)).put("name",cursor.getString(1)))
            }
            invoke.resolve(JSObject().put("calendars",calendars))
        } catch(e:Exception){invoke.reject("读取日历失败："+(e.message?:"请检查日历权限"))} }
    }
    @PermissionCallback
    fun calendarReady(invoke:Invoke) {
        if(getPermissionState("calendar")==PermissionState.GRANTED)calendars(invoke) else invoke.reject("未授权日历访问，请在系统设置中允许日历权限后重试")
    }
    @PermissionCallback
    fun calendarTodoReady(invoke:Invoke) {
        if(getPermissionState("calendar")==PermissionState.GRANTED)addTodo(invoke) else invoke.reject("未授权日历访问，待办没有写入")
    }
    @Command
    fun addTodo(invoke:Invoke) {
        if(getPermissionState("calendar")!=PermissionState.GRANTED){requestPermissionForAlias("calendar",invoke,"calendarTodoReady");return}
        val args=invoke.parseArgs(CalendarTodoArgs::class.java)
        io.execute {try {
            require(args.title.trim().isNotEmpty() && args.title.length<=500){"请输入待办标题（最多500字）"}
            require(args.calendarId>0 && args.start>0 && args.end>args.start){"请选择日历和有效的开始、结束时间"}
            require(args.reminderMinutes in -1..525600){"提醒时间无效"}
            require(args.rrule.isEmpty() || args.rrule.matches(Regex("FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;INTERVAL=[0-9]{1,3})?(;BYDAY=(MO,TU,WE,TH,FR))?(;(COUNT=[0-9]{1,4}|UNTIL=[0-9]{8}T[0-9]{6}Z))?"))){"重复规则无效"}
            val alarmSeconds=(args.start-args.reminderMinutes.coerceAtLeast(0)*60000L-System.currentTimeMillis())/1000
            require(!args.alarm || (args.reminderMinutes>=0 && alarmSeconds in 1..Int.MAX_VALUE.toLong())){"闹钟提醒时间必须在未来"}
            var reminderMethod=CalendarContract.Reminders.METHOD_ALERT
            val eligible=activity.contentResolver.query(CalendarContract.Calendars.CONTENT_URI,arrayOf(CalendarContract.Calendars.ALLOWED_REMINDERS,CalendarContract.Calendars.MAX_REMINDERS),"${CalendarContract.Calendars._ID} = ? AND ${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL} >= ?",arrayOf(args.calendarId.toString(),CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR.toString()),null)?.use {cursor->
                if(!cursor.moveToFirst())false else {
                    if(args.reminderMinutes>=0){
                        require(cursor.isNull(1) || cursor.getInt(1)>0){"这个日历不支持提醒，请选择其他日历"}
                        val allowed=cursor.getString(0).orEmpty().split(",").filter {it.isNotBlank()}
                        if(allowed.isNotEmpty() && !allowed.contains(reminderMethod.toString())){
                            require(allowed.contains(CalendarContract.Reminders.METHOD_DEFAULT.toString())){"这个日历不支持本机提醒"}
                            reminderMethod=CalendarContract.Reminders.METHOD_DEFAULT
                        }
                    };true
                }
            } ?: false
            require(eligible){"日历不可写或已被删除，请重新选择日历"}
            val values=ContentValues().apply {
                put(CalendarContract.Events.CALENDAR_ID,args.calendarId);put(CalendarContract.Events.TITLE,args.title.trim());put(CalendarContract.Events.DESCRIPTION,args.description)
                put(CalendarContract.Events.DTSTART,args.start);put(CalendarContract.Events.EVENT_TIMEZONE,TimeZone.getDefault().id)
                put(CalendarContract.Events.HAS_ALARM,if(args.reminderMinutes>=0)1 else 0)
                if(args.rrule.isEmpty())put(CalendarContract.Events.DTEND,args.end) else {put(CalendarContract.Events.RRULE,args.rrule);put(CalendarContract.Events.DURATION,"PT${(args.end-args.start)/1000}S")}
            }
            val operations=arrayListOf(ContentProviderOperation.newInsert(CalendarContract.Events.CONTENT_URI).withValues(values).build())
            if(args.reminderMinutes>=0)operations.add(ContentProviderOperation.newInsert(CalendarContract.Reminders.CONTENT_URI).withValueBackReference(CalendarContract.Reminders.EVENT_ID,0).withValue(CalendarContract.Reminders.MINUTES,args.reminderMinutes).withValue(CalendarContract.Reminders.METHOD,reminderMethod).build())
            val results=activity.contentResolver.applyBatch(CalendarContract.AUTHORITY,operations)
            val result=JSObject().put("eventUri",results[0].uri.toString())
            if(args.alarm)activity.runOnUiThread {
                try {activity.startActivity(Intent(AlarmClock.ACTION_SET_TIMER).putExtra(AlarmClock.EXTRA_LENGTH,alarmSeconds.toInt()).putExtra(AlarmClock.EXTRA_MESSAGE,args.title).putExtra(AlarmClock.EXTRA_SKIP_UI,false))}
                catch (_:Exception){result.put("warning","待办已写入日历，但设备没有可用的系统闹钟应用；日历提醒仍然有效")}
                invoke.resolve(result)
            } else invoke.resolve(result)
        } catch(e:Exception){invoke.reject("添加待办失败："+(e.message?:"请检查日历权限和时间设置"))} }
    }

    @Command
    fun storageAccess(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            invoke.resolve(JSObject().put("granted", false)); return
        }
        if (Environment.isExternalStorageManager()) {
            invoke.resolve(JSObject().put("granted", true)); return
        }
        val prefs = activity.getSharedPreferences("local-documents", Activity.MODE_PRIVATE)
        // A declined request must never repeatedly interrupt startup or file saves.
        val args = invoke.parseArgs(StorageArgs::class.java)
        if (args.checkOnly || (!args.force && prefs.getBoolean("storage-access-requested", false))) {
            invoke.resolve(JSObject().put("granted", false)); return
        }
        prefs.edit().putBoolean("storage-access-requested", true).apply()
        val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + activity.packageName))
        try { startActivityForResult(invoke, intent, "storageAccessResult") }
        catch (_: Exception) { invoke.resolve(JSObject().put("granted", false)) }
    }

    @ActivityCallback
    fun storageAccessResult(invoke: Invoke, result: ActivityResult) {
        invoke.resolve(JSObject().put("granted", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()))
    }

    private fun sharedFile(uri: Uri): File? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || !Environment.isExternalStorageManager()) return null
        if (uri.scheme == "file") return uri.path?.let { File(it) }
        val prefs=activity.getSharedPreferences("local-documents",Activity.MODE_PRIVATE)
        fun accepted(path:String?):File? {
            if(path==null)return null
            val file=try {File(path).canonicalFile} catch (_:Exception){return null}
            return file.takeIf {it.isFile && (it.path.startsWith("/storage/") || it.path.startsWith("/mnt/media_rw/"))}
        }
        accepted(prefs.getString("path:"+uri.toString(),null))?.let{return it}
        val queried=try {activity.contentResolver.query(uri,arrayOf(MediaStore.MediaColumns.DATA),null,null,null)?.use {cursor->if(cursor.moveToFirst())cursor.getString(0) else null}} catch (_:Exception){null}
        accepted(queried)?.let{prefs.edit().putString("path:"+uri.toString(),it.path).apply();return it}
        if(uri.authority=="com.android.providers.downloads.documents") {
            val id=try {DocumentsContract.getDocumentId(uri)}catch (_:Exception){""}
            if(id.startsWith("raw:"))accepted(id.removePrefix("raw:"))?.let{return it}
        }
        if (uri.authority != "com.android.externalstorage.documents") return null
        return try {
            val parts = DocumentsContract.getDocumentId(uri).split(":", limit = 2)
            if (parts.size != 2) return null
            val root = when {
                parts[0] == "primary" -> Environment.getExternalStorageDirectory().canonicalFile
                parts[0].matches(Regex("[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}")) -> File("/storage", parts[0]).canonicalFile
                else -> return null
            }
            val file = File(root, parts[1]).canonicalFile
            if (file.path.startsWith(root.path + File.separator)) {prefs.edit().putString("path:"+uri.toString(),file.path).apply();file} else null
        } catch (_: Exception) { null }
    }

    @Command
    fun consumeIntent(invoke: Invoke) {
        invoke.resolve(JSObject().put("path", IncomingDocuments.consume()))
    }

    @Command
    fun pick(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/plain", "text/markdown", "application/octet-stream"))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(invoke, intent, "picked")
    }

    @ActivityCallback
    fun picked(invoke: Invoke, result: ActivityResult) {
        val data = result.data
        val uri = data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            invoke.resolve(JSObject().put("canceled", true))
            return
        }
        val grants = (data?.flags ?: 0) and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try { activity.contentResolver.takePersistableUriPermission(uri, grants) } catch (_: SecurityException) { /* Some providers only grant session access; recheck on every open. */ }
        io.execute { invoke.resolve(readDocument(uri).put("canceled", false)) }
    }

    @Command
    fun read(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        io.execute {
            try { invoke.resolve(readDocument(Uri.parse(args.uri))) }
            catch (e: Exception) { invoke.reject(e.message ?: "Cannot open local document") }
        }
    }

    private fun readDocument(uri: Uri): JSObject {
        val out = JSObject().put("path", uri.toString()).put("localFileMode", "tauri")
        try {
            val direct = sharedFile(uri)
            if (direct != null && direct.isFile) {
                return out.put("path", direct.path).put("name", direct.name).put("content", direct.readText(Charsets.UTF_8)).put("success", true).put("writable", direct.canWrite())
            }
            try {
                if (uri.scheme == "content") activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) out.put("name", cursor.getString(0))
                }
            } catch (_: Exception) { /* A missing display-name query must not block reading. */ }
            if (!out.has("name")) out.put("name", uri.lastPathSegment ?: "document.md")
            val content = activity.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                ?: throw IllegalStateException("Cannot read local document")
            out.put("content", content)
            // Probe edit access without truncating or changing the original file.
            val writable = try { activity.contentResolver.openFileDescriptor(uri, "rw")?.use { true } ?: false } catch (_: Exception) { false }
            out.put("success", true).put("writable", writable)
        } catch (e: Exception) {
            out.put("success", false).put("writable", false).put("error", e.message ?: "Document permission unavailable")
        }
        return out
    }

    @Command
    fun write(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        io.execute {
        try {
            val uri = Uri.parse(args.uri)
            val direct = sharedFile(uri)
            if (direct != null) {
                direct.writeText(args.content, Charsets.UTF_8)
            } else {
                activity.contentResolver.openOutputStream(uri, "wt")?.use { it.write(args.content.toByteArray(Charsets.UTF_8)) }
                    ?: throw IllegalStateException("Cannot save local document")
            }
            invoke.resolve(JSObject().put("success", true).put("path", args.uri))
        } catch (e: Exception) {
            invoke.resolve(JSObject().put("success", false).put("path", args.uri).put("error", e.message ?: "Cannot save local document"))
        }
        }
    }
}
