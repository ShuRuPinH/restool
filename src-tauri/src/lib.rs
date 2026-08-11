mod curl;
mod executor;
mod history;
mod models;

use curl::{export_curl, parse_curl};
use executor::execute_request;
use history::HistoryStore;
use models::{ExecuteResult, HistoryEntry, HttpRequest, PickedFile};
use std::{path::PathBuf, sync::Arc};
use tauri::State;

struct AppState {
    history: Arc<HistoryStore>,
}

#[tauri::command]
fn parse_curl_command(command: String) -> Result<HttpRequest, String> {
    parse_curl(&command).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_curl_command(request: HttpRequest) -> Result<String, String> {
    export_curl(&request).map_err(|e| e.to_string())
}

#[tauri::command]
fn pick_file() -> Result<Option<PickedFile>, String> {
    let path = rfd::FileDialog::new()
        .set_title("Select file")
        .pick_file();
    Ok(path.map(|path: PathBuf| {
        let file_name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let content_type = guess_content_type(&path, &file_name);
        PickedFile {
            path: path.to_string_lossy().into_owned(),
            file_name,
            content_type,
        }
    }))
}

fn guess_content_type(path: &std::path::Path, file_name: &str) -> String {
    let ext = path
        .extension()
        .or_else(|| std::path::Path::new(file_name).extension())
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" | "heif" => "image/heif",
        "pdf" => "application/pdf",
        "json" => "application/json",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "xml" => "application/xml",
        "zip" => "application/zip",
        "mp4" => "video/mp4",
        "mp3" => "audio/mpeg",
        _ => "",
    }
    .to_string()
}

#[tauri::command]
async fn send_request(
    state: State<'_, AppState>,
    request: HttpRequest,
) -> Result<ExecuteResult, String> {
    let mut result = execute_request(request).await;
    match state.history.push(result.history.clone()) {
        Ok(saved) => result.history = saved,
        Err(err) => {
            result
                .events
                .push(models::TraceEvent {
                    at_ms: result.events.last().map(|e| e.at_ms).unwrap_or(0),
                    kind: "history".into(),
                    message: "Failed to persist history".into(),
                    detail: Some(err.to_string()),
                });
        }
    }
    Ok(result)
}

#[tauri::command]
fn list_history(state: State<'_, AppState>) -> Result<Vec<HistoryEntry>, String> {
    state.history.list().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_history(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.history.delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_history_tag(
    state: State<'_, AppState>,
    id: String,
    tag: Option<String>,
) -> Result<HistoryEntry, String> {
    state
        .history
        .update_tag(&id, tag)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    state.history.clear().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let history = HistoryStore::open().expect("failed to open history store");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            history: Arc::new(history),
        })
        .invoke_handler(tauri::generate_handler![
            parse_curl_command,
            export_curl_command,
            pick_file,
            send_request,
            list_history,
            delete_history,
            update_history_tag,
            clear_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
