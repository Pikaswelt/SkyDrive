mod actions;
mod classify;
mod drives;
mod duplicates;
mod model;
mod scan;

use model::*;
use scan::AppState;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
fn get_user_profile() -> UserProfile {
    scan::user_profile()
}

#[tauri::command]
fn list_drives() -> Vec<DriveInfo> {
    drives::list_drives()
}

#[tauri::command]
fn get_scan_progress(state: State<Arc<AppState>>) -> ScanProgress {
    state.progress.lock().clone()
}

#[tauri::command]
fn cancel_scan(state: State<Arc<AppState>>) {
    state.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
fn get_scan_summary(state: State<Arc<AppState>>, mount: String) -> Result<Option<ScanSummary>, String> {
    let mut scans = state.scans.lock();
    let Some(scan) = scans.get_mut(&mount) else {
        return Ok(None);
    };
    if let Some(live) = crate::drives::refresh_drive(&mount) {
        scan.drive = live;
    }
    let inaccessible = scan.drive.used.saturating_sub(scan.scanned_bytes);
    Ok(Some(scan::build_summary(scan, inaccessible)))
}

#[tauri::command]
fn list_folder(state: State<Arc<AppState>>, mount: String, path: String) -> Result<FolderDetail, String> {
    let scans = state.scans.lock();
    Ok(scan::list_folder(scans.get(&mount), &path))
}

#[tauri::command]
fn get_large_files(state: State<Arc<AppState>>, mount: String) -> Result<Vec<FileEntry>, String> {
    Ok(state
        .scans
        .lock()
        .get(&mount)
        .map(|s| s.large_files.clone())
        .unwrap_or_default())
}

#[tauri::command]
fn get_recent_files(state: State<Arc<AppState>>, mount: String) -> Result<Vec<FileEntry>, String> {
    Ok(state
        .scans
        .lock()
        .get(&mount)
        .map(|s| s.recent_files.clone())
        .unwrap_or_default())
}

#[tauri::command]
fn find_duplicates(state: State<Arc<AppState>>, mount: String) -> Result<DuplicateReport, String> {
    duplicates::find_duplicates(&state, &mount)
}

#[tauri::command]
fn list_temp(state: State<Arc<AppState>>, mount: String) -> TempReport {
    duplicates::temp_report(&state, &mount)
}

#[tauri::command]
fn list_downloads(state: State<Arc<AppState>>, mount: String) -> Vec<FileEntry> {
    duplicates::list_downloads(&state, &mount)
}

#[tauri::command]
fn list_trash() -> Vec<TrashItem> {
    duplicates::list_trash()
}

#[tauri::command]
fn open_path(path: String) -> Result<ActionResult, String> {
    actions::open_path(&path)
}

#[tauri::command]
fn reveal_path(path: String) -> Result<ActionResult, String> {
    actions::reveal_path(&path)
}

#[tauri::command]
fn delete_paths(paths: Vec<String>, to_trash: bool) -> Result<ActionResult, String> {
    actions::delete_paths(paths, to_trash)
}

#[tauri::command]
fn empty_trash() -> Result<ActionResult, String> {
    actions::empty_trash()
}

#[tauri::command]
fn start_scan(app: AppHandle, state: State<Arc<AppState>>, mount: String) -> Result<(), String> {
    if state.scanning.load(std::sync::atomic::Ordering::SeqCst) {
        return Ok(());
    }
    let drive = drives::list_drives()
        .into_iter()
        .find(|d| d.mount == mount)
        .ok_or_else(|| "Laufwerk nicht gefunden.".to_string())?;
    let state_arc = Arc::clone(&state);
    std::thread::spawn(move || {
        let emit = |p: &ScanProgress| {
            let _ = app.emit("scan-progress", p);
        };
        match scan::run_scan(&state_arc, drive, emit) {
            Ok(summary) => {
                let _ = app.emit("scan-complete", &summary);
            }
            Err(e) => {
                let mut p = state_arc.progress.lock();
                p.status = "error".into();
                p.message = e.clone();
                let _ = app.emit("scan-progress", p.clone());
                let _ = app.emit("scan-error", e);
            }
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState::default());
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_user_profile,
            list_drives,
            get_scan_progress,
            cancel_scan,
            get_scan_summary,
            list_folder,
            get_large_files,
            get_recent_files,
            find_duplicates,
            list_temp,
            list_downloads,
            list_trash,
            open_path,
            reveal_path,
            delete_paths,
            empty_trash,
            start_scan
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
