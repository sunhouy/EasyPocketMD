#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

const SETTINGS_FILE: &str = "desktop-settings.json";

pub struct PendingOpenFilePath(pub Mutex<Option<String>>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    md_file_association_enabled: bool,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            md_file_association_enabled: true,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenLocalFileDialogResponse {
    canceled: bool,
    success: Option<bool>,
    path: Option<String>,
    name: Option<String>,
    content: Option<String>,
    error: Option<String>,
    local_file_mode: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadLocalFileResponse {
    success: bool,
    path: Option<String>,
    name: Option<String>,
    content: Option<String>,
    error: Option<String>,
    local_file_mode: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteLocalFileResponse {
    success: bool,
    path: Option<String>,
    error: Option<String>,
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())
}

fn get_local_files_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "local data directory is unavailable".to_string())?;
    path.push("local_files");
    ensure_dir(&path)?;
    Ok(path)
}

fn get_app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|_| "config directory is unavailable".to_string())?;
    ensure_dir(&path)?;
    Ok(path)
}

fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = get_app_config_dir(app)?;
    dir.push(SETTINGS_FILE);
    Ok(dir)
}

fn read_settings(app: &AppHandle) -> DesktopSettings {
    let settings_path = match get_settings_path(app) {
        Ok(path) => path,
        Err(_) => return DesktopSettings::default(),
    };

    if !settings_path.exists() {
        return DesktopSettings::default();
    }

    let raw = match fs::read_to_string(&settings_path) {
        Ok(content) => content,
        Err(_) => return DesktopSettings::default(),
    };

    serde_json::from_str::<DesktopSettings>(&raw).unwrap_or_default()
}

fn write_settings(app: &AppHandle, settings: &DesktopSettings) -> Result<(), String> {
    let settings_path = get_settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(settings_path, raw).map_err(|error| error.to_string())
}

fn safe_file_name(name: &str) -> String {
    Path::new(name)
        .file_name()
        .and_then(|segment| segment.to_str())
        .filter(|segment| !segment.trim().is_empty())
        .map(|segment| segment.to_string())
        .unwrap_or_else(|| format!("local-{}.md", chrono_like_now()))
}

fn chrono_like_now() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn normalize_file_path(file_path: String) -> PathBuf {
    if cfg!(windows) && file_path.starts_with("file:///") {
        let trimmed = file_path.trim_start_matches("file:///");
        return PathBuf::from(trimmed.replace('/', "\\"));
    }
    if file_path.starts_with("file://") {
        return PathBuf::from(file_path.trim_start_matches("file://"));
    }
    PathBuf::from(file_path)
}

fn read_text_file(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn extract_open_file_path<I>(argv: I) -> Option<PathBuf>
where
    I: IntoIterator,
    I::Item: AsRef<str>,
{
    let current_exe = std::env::current_exe().ok();

    for arg in argv {
        let arg = arg.as_ref();
        if arg.is_empty() || arg.starts_with("--") {
            continue;
        }

        let path = PathBuf::from(arg);
        if let Some(exe) = &current_exe {
            if &path == exe {
                continue;
            }
        }

        if !path.exists() || !path.is_file() {
            continue;
        }

        if let Ok(canonical) = path.canonicalize() {
            return Some(canonical);
        }
        return Some(path);
    }

    None
}

#[tauri::command]
fn save_local_file(app: AppHandle, name: String, content: String) -> Result<String, String> {
    let mut file_path = get_local_files_dir(&app)?;
    file_path.push(safe_file_name(&name));

    if content.starts_with("data:") {
        let base64_data = content
            .split_once(',')
            .map(|(_, payload)| payload)
            .ok_or_else(|| "invalid data url".to_string())?;
        let bytes = BASE64_ENGINE
            .decode(base64_data)
            .map_err(|error| error.to_string())?;
        fs::write(&file_path, bytes).map_err(|error| error.to_string())?;
    } else {
        fs::write(&file_path, content).map_err(|error| error.to_string())?;
    }

    Ok(format!("file://{}", path_to_string(&file_path)))
}

#[tauri::command]
fn get_local_file_path(app: AppHandle, name: String) -> Result<String, String> {
    let mut file_path = get_local_files_dir(&app)?;
    file_path.push(safe_file_name(&name));
    Ok(format!("file://{}", path_to_string(&file_path)))
}

#[tauri::command]
fn open_local_file_dialog(app: AppHandle) -> OpenLocalFileDialogResponse {
    let result = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .blocking_pick_file();

    let path = match result {
        Some(path) => path,
        None => {
            return OpenLocalFileDialogResponse {
                canceled: true,
                success: None,
                path: None,
                name: None,
                content: None,
                error: None,
                local_file_mode: None,
            }
        }
    };

    let path_string = path.to_string();
    let path_buf = match path.clone().into_path() {
        Ok(value) => value,
        Err(error) => {
            return OpenLocalFileDialogResponse {
                canceled: false,
                success: Some(false),
                path: None,
                name: None,
                content: None,
                error: Some(error.to_string()),
                local_file_mode: None,
            }
        }
    };

    match read_text_file(&path_buf) {
        Ok(content) => OpenLocalFileDialogResponse {
            canceled: false,
            success: Some(true),
            path: Some(path_string),
            name: path_buf
                .file_name()
                .and_then(|segment| segment.to_str())
                .map(|segment| segment.to_string()),
            content: Some(content),
            error: None,
            local_file_mode: Some("tauri".to_string()),
        },
        Err(error) => OpenLocalFileDialogResponse {
            canceled: false,
            success: Some(false),
            path: None,
            name: None,
            content: None,
            error: Some(error),
            local_file_mode: None,
        },
    }
}

#[tauri::command]
fn read_local_file(file_path: String) -> ReadLocalFileResponse {
    if file_path.trim().is_empty() {
        return ReadLocalFileResponse {
            success: false,
            path: None,
            name: None,
            content: None,
            error: Some("Empty path".to_string()),
            local_file_mode: None,
        };
    }

    let normalized = normalize_file_path(file_path);
    if !normalized.exists() {
        return ReadLocalFileResponse {
            success: false,
            path: None,
            name: None,
            content: None,
            error: Some("File not found".to_string()),
            local_file_mode: None,
        };
    }

    match read_text_file(&normalized) {
        Ok(content) => ReadLocalFileResponse {
            success: true,
            path: Some(path_to_string(&normalized)),
            name: normalized
                .file_name()
                .and_then(|segment| segment.to_str())
                .map(|segment| segment.to_string()),
            content: Some(content),
            error: None,
            local_file_mode: Some("tauri".to_string()),
        },
        Err(error) => ReadLocalFileResponse {
            success: false,
            path: None,
            name: None,
            content: None,
            error: Some(error),
            local_file_mode: None,
        },
    }
}

#[tauri::command]
fn write_local_file(file_path: String, content: String) -> WriteLocalFileResponse {
    if file_path.trim().is_empty() {
        return WriteLocalFileResponse {
            success: false,
            path: None,
            error: Some("Empty path".to_string()),
        };
    }

    let normalized = normalize_file_path(file_path);
    match fs::write(&normalized, content) {
        Ok(_) => WriteLocalFileResponse {
            success: true,
            path: Some(path_to_string(&normalized)),
            error: None,
        },
        Err(error) => WriteLocalFileResponse {
            success: false,
            path: None,
            error: Some(error.to_string()),
        },
    }
}

#[tauri::command]
fn get_md_association_enabled(app: AppHandle) -> bool {
    read_settings(&app).md_file_association_enabled
}

#[tauri::command]
fn set_md_association_enabled(app: AppHandle, enabled: bool) -> bool {
    let mut settings = read_settings(&app);
    settings.md_file_association_enabled = enabled;
    if write_settings(&app, &settings).is_err() {
        return read_settings(&app).md_file_association_enabled;
    }
    settings.md_file_association_enabled
}

fn emit_open_file_event(app: &AppHandle, path: PathBuf) {
    let _ = app.emit("open-local-file-request", path_to_string(&path));
}

#[tauri::command]
fn consume_pending_open_file_path(
    pending_open_file_path: tauri::State<'_, PendingOpenFilePath>,
) -> Option<String> {
    match pending_open_file_path.0.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PendingOpenFilePath(Mutex::new(None)))
        .setup(|app| {
            if let Some(path) = extract_open_file_path(std::env::args().skip(1)) {
                if let Ok(mut guard) = app.state::<PendingOpenFilePath>().0.lock() {
                    *guard = Some(path_to_string(&path));
                }
                emit_open_file_event(&app.app_handle(), path);
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            save_local_file,
            get_local_file_path,
            open_local_file_dialog,
            read_local_file,
            write_local_file,
            get_md_association_enabled,
            set_md_association_enabled,
            consume_pending_open_file_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
