use crate::classify;
use crate::drives;
use crate::model::*;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct AppState {
    pub scans: Mutex<HashMap<String, DriveScan>>,
    pub progress: Mutex<ScanProgress>,
    pub cancel: AtomicBool,
    pub scanning: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            scans: Mutex::new(HashMap::new()),
            progress: Mutex::new(ScanProgress {
                drive: String::new(),
                status: "idle".into(),
                current_path: String::new(),
                files_scanned: 0,
                dirs_scanned: 0,
                bytes_scanned: 0,
                percent: 0.0,
                message: "Bereit".into(),
            }),
            cancel: AtomicBool::new(false),
            scanning: AtomicBool::new(false),
        }
    }
}

pub fn user_profile() -> UserProfile {
    let username = whoami::username();
    let real = whoami::realname();
    let display_name = if real.trim().is_empty() {
        let mut chars = username.chars();
        match chars.next() {
            None => String::new(),
            Some(f) => f.to_uppercase().collect::<String>() + chars.as_str(),
        }
    } else {
        real
    };
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    UserProfile {
        username,
        display_name,
        home,
    }
}

fn folder_depth(p: &str) -> usize {
    Path::new(p).components().count()
}

pub fn run_scan<F>(state: &Arc<AppState>, drive: DriveInfo, emit: F) -> Result<ScanSummary, String>
where
    F: Fn(&ScanProgress),
{
    state.scanning.store(true, Ordering::SeqCst);
    state.cancel.store(false, Ordering::SeqCst);

    let res = run_scan_inner(state, &drive, &emit);
    state.scanning.store(false, Ordering::SeqCst);
    res
}

fn run_scan_inner<F>(state: &Arc<AppState>, drive: &DriveInfo, emit: &F) -> Result<ScanSummary, String>
where
    F: Fn(&ScanProgress),
{
    let root = drive.mount.clone();
    let mut folders: HashMap<String, FolderStat> = HashMap::new();
    let mut categories: HashMap<String, u64> = HashMap::new();
    let mut file_types: HashMap<String, u64> = HashMap::new();
    let mut large_files: Vec<FileEntry> = Vec::new();
    let mut recent_files: Vec<FileEntry> = Vec::new();
    let mut size_index: HashMap<u64, Vec<String>> = HashMap::new();

    let mut files_scanned = 0u64;
    let mut dirs_scanned = 0u64;
    let mut bytes_scanned = 0u64;
    let mut inaccessible_count = 0u64;

    folders.insert(
        root.clone(),
        FolderStat {
            path: root.clone(),
            name: root.clone(),
            size: 0,
            file_count: 0,
            dir_count: 0,
            mtime: 0,
            types: HashMap::new(),
            child_dirs: Vec::new(),
            inaccessible: false,
        },
    );

    let mut stack: Vec<String> = vec![root.clone()];

    while let Some(dir) = stack.pop() {
        if state.cancel.load(Ordering::SeqCst) {
            return Err("Scan abgebrochen.".into());
        }

        if classify::should_skip_dir(&dir) {
            continue;
        }

        let dir_path = Path::new(&dir);
        let read_res = fs::read_dir(dir_path);
        let entries = match read_res {
            Ok(iter) => iter,
            Err(_) => {
                inaccessible_count += 1;
                if let Some(stat) = folders.get_mut(&dir) {
                    stat.inaccessible = true;
                }
                continue;
            }
        };

        dirs_scanned += 1;
        let mut new_children = Vec::new();

        for entry_res in entries {
            let entry = match entry_res {
                Ok(e) => e,
                Err(_) => {
                    inaccessible_count += 1;
                    continue;
                }
            };

            let file_type = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => {
                    inaccessible_count += 1;
                    continue;
                }
            };

            if file_type.is_symlink() {
                continue;
            }

            let full_path = entry.path().to_string_lossy().to_string();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if file_type.is_dir() {
                if classify::should_skip_dir(&full_path) {
                    continue;
                }

                new_children.push(full_path.clone());
                folders.entry(full_path.clone()).or_insert_with(|| FolderStat {
                    path: full_path.clone(),
                    name: file_name,
                    size: 0,
                    file_count: 0,
                    dir_count: 0,
                    mtime: 0,
                    types: HashMap::new(),
                    child_dirs: Vec::new(),
                    inaccessible: false,
                });
                stack.push(full_path);
                continue;
            }

            if !file_type.is_file() {
                continue;
            }

            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => {
                    inaccessible_count += 1;
                    continue;
                }
            };

            let size = meta.len();
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            let ext = file_ext(&file_name);
            let kind = file_kind(&ext).to_string();
            let cat = classify::classify_path(&full_path);
            let cat_key = cat.key().to_string();

            files_scanned += 1;
            bytes_scanned += size;

            if let Some(parent_stat) = folders.get_mut(&dir) {
                parent_stat.size += size;
                parent_stat.file_count += 1;
                if mtime > parent_stat.mtime {
                    parent_stat.mtime = mtime;
                }
                *parent_stat.types.entry(kind.clone()).or_insert(0) += size;
            }

            *categories.entry(cat_key).or_insert(0) += size;
            *file_types.entry(kind.clone()).or_insert(0) += size;

            let fe = FileEntry {
                name: file_name,
                path: full_path.clone(),
                size,
                mtime,
                ext,
                kind,
                inaccessible: false,
            };

            large_files.push(fe.clone());
            if large_files.len() > 800 {
                large_files.sort_by_key(|f| std::cmp::Reverse(f.size));
                large_files.truncate(400);
            }

            recent_files.push(fe);
            if recent_files.len() > 400 {
                recent_files.sort_by_key(|f| std::cmp::Reverse(f.mtime));
                recent_files.truncate(60);
            }

            if size >= 4096 {
                size_index.entry(size).or_default().push(full_path.clone());
            }

            if files_scanned % 200 == 0 {
                let percent = ((bytes_scanned as f64 / drive.used.max(1) as f64) * 99.0).min(99.0) as f32;
                let prog = ScanProgress {
                    drive: drive.mount.clone(),
                    status: "scanning".into(),
                    current_path: full_path,
                    files_scanned,
                    dirs_scanned,
                    bytes_scanned,
                    percent,
                    message: format!("Analysiere {}", drive.name),
                };
                *state.progress.lock() = prog.clone();
                emit(&prog);
            }
        }

        if let Some(parent_stat) = folders.get_mut(&dir) {
            for ch in new_children {
                if !parent_stat.child_dirs.contains(&ch) {
                    parent_stat.child_dirs.push(ch);
                }
            }
        }
    }

    {
        let prog = ScanProgress {
            drive: drive.mount.clone(),
            status: "aggregating".into(),
            current_path: String::new(),
            files_scanned,
            dirs_scanned,
            bytes_scanned,
            percent: 99.0,
            message: "Werte werden zusammengeführt …".into(),
        };
        *state.progress.lock() = prog.clone();
        emit(&prog);
    }

    let mut paths: Vec<String> = folders.keys().cloned().collect();
    paths.sort_by_key(|p| std::cmp::Reverse(folder_depth(p)));

    for p in paths {
        let child_dirs = match folders.get(&p) {
            Some(f) => f.child_dirs.clone(),
            None => continue,
        };

        let mut extra_size = 0u64;
        let mut extra_files = 0u64;
        let extra_dirs = child_dirs.len() as u64;
        let mut extra_types: HashMap<String, u64> = HashMap::new();

        for c in &child_dirs {
            if let Some(ch) = folders.get(c) {
                extra_size += ch.size;
                extra_files += ch.file_count;
                for (k, &v) in &ch.types {
                    *extra_types.entry(k.clone()).or_insert(0) += v;
                }
            }
        }

        if let Some(f) = folders.get_mut(&p) {
            f.size += extra_size;
            f.file_count += extra_files;
            f.dir_count = extra_dirs;
            for (k, v) in extra_types {
                *f.types.entry(k).or_insert(0) += v;
            }
        }
    }

    large_files.sort_by_key(|f| std::cmp::Reverse(f.size));
    large_files.truncate(400);

    recent_files.sort_by_key(|f| std::cmp::Reverse(f.mtime));
    recent_files.truncate(60);

    size_index.retain(|_, v| v.len() > 1);

    let root_stat = folders.get(&root);
    let scanned_bytes = root_stat.map(|s| s.size).unwrap_or(bytes_scanned);
    let total_file_count = root_stat.map(|s| s.file_count).unwrap_or(files_scanned);
    let total_dir_count = root_stat.map(|s| s.dir_count).unwrap_or(dirs_scanned);

    let live = drives::refresh_drive(&drive.mount).unwrap_or_else(|| drive.clone());
    let inaccessible_bytes = live.used.saturating_sub(scanned_bytes);

    let drive_scan = DriveScan {
        drive: live,
        scanned_at: now_secs(),
        scanned_bytes,
        file_count: total_file_count,
        dir_count: total_dir_count,
        inaccessible_count,
        categories,
        file_types,
        folders,
        large_files,
        recent_files,
        size_index,
    };

    let summary = build_summary(&drive_scan, inaccessible_bytes);
    state.scans.lock().insert(drive.mount.clone(), drive_scan);

    let done_prog = ScanProgress {
        drive: drive.mount.clone(),
        status: "done".into(),
        current_path: String::new(),
        files_scanned: total_file_count,
        dirs_scanned: total_dir_count,
        bytes_scanned,
        percent: 100.0,
        message: "Scan abgeschlossen.".into(),
    };
    *state.progress.lock() = done_prog.clone();
    emit(&done_prog);

    Ok(summary)
}

pub fn build_summary(scan: &DriveScan, inaccessible_bytes: u64) -> ScanSummary {
    let used = (scan.drive.used)
        .max(scan.scanned_bytes + inaccessible_bytes)
        .max(1) as f64;

    let mut dashboard_map: HashMap<&'static str, NamedSize> = [
        ("programme", NamedSize { key: "programme".into(), label: "Programme".into(), bytes: 0, percent: 0.0, color: "#8b7cff".into() }),
        ("spiele", NamedSize { key: "spiele".into(), label: "Spiele".into(), bytes: 0, percent: 0.0, color: "#f472b6".into() }),
        ("dokumente", NamedSize { key: "dokumente".into(), label: "Dokumente".into(), bytes: 0, percent: 0.0, color: "#7dd3fc".into() }),
        ("media", NamedSize { key: "media".into(), label: "Bilder & Videos".into(), bytes: 0, percent: 0.0, color: "#fde68a".into() }),
        ("sonstiges", NamedSize { key: "sonstiges".into(), label: "Sonstiges".into(), bytes: 0, percent: 0.0, color: "#fdba74".into() }),
    ].into_iter().collect();

    for (key, &bytes) in &scan.categories {
        let (dash_key, dash_label, dash_color) = match key.as_str() {
            "programs" | "engines" => ("programme", "Programme", "#8b7cff"),
            "games" => ("spiele", "Spiele", "#f472b6"),
            "documents" | "downloads" => ("dokumente", "Dokumente", "#7dd3fc"),
            "pictures" | "videos" => ("media", "Bilder & Videos", "#fde68a"),
            _ => ("sonstiges", "Sonstiges", "#fdba74"),
        };
        let entry = dashboard_map.entry(dash_key).or_insert_with(|| NamedSize {
            key: dash_key.into(),
            label: dash_label.into(),
            bytes: 0,
            percent: 0.0,
            color: dash_color.into(),
        });
        entry.bytes += bytes;
    }

    if inaccessible_bytes > 0 {
        if let Some(entry) = dashboard_map.get_mut("sonstiges") {
            entry.bytes += inaccessible_bytes;
        }
    }

    for item in dashboard_map.values_mut() {
        item.percent = (item.bytes as f64 / used) * 100.0;
    }

    let dashboard: Vec<NamedSize> = vec!["programme", "spiele", "dokumente", "media", "sonstiges"]
        .into_iter()
        .filter_map(|k| dashboard_map.remove(k))
        .collect();

    let mut detailed_map: HashMap<&'static str, NamedSize> = HashMap::new();
    for (key, &bytes) in &scan.categories {
        let (det_key, det_label, det_color) = match key.as_str() {
            "windows" => ("windows", "Windows", "#64748b"),
            "programs" => ("programs", "Installierte Programme", "#8b7cff"),
            "games" => ("games", "Spiele", "#f472b6"),
            "engines" => ("engines", "Game Engines", "#a78bfa"),
            "documents" | "pictures" | "videos" | "music" => ("userfiles", "Benutzerdateien", "#7dd3fc"),
            "downloads" => ("downloads", "Downloads", "#38bdf8"),
            "appdata" => ("appdata", "AppData", "#94a3b8"),
            "temp" => ("temp", "Temporäre Dateien", "#fbbf24"),
            _ => ("other", "Sonstige Dateien", "#fdba74"),
        };
        let entry = detailed_map.entry(det_key).or_insert_with(|| NamedSize {
            key: det_key.into(),
            label: det_label.into(),
            bytes: 0,
            percent: 0.0,
            color: det_color.into(),
        });
        entry.bytes += bytes;
    }

    if inaccessible_bytes > 0 {
        detailed_map.insert("inaccessible", NamedSize {
            key: "inaccessible".into(),
            label: "Nicht zugänglich".into(),
            bytes: inaccessible_bytes,
            percent: (inaccessible_bytes as f64 / used) * 100.0,
            color: "#64748b".into(),
        });
    }

    for item in detailed_map.values_mut() {
        item.percent = (item.bytes as f64 / used) * 100.0;
    }

    let det_order = [
        "windows", "programs", "games", "engines", "userfiles",
        "downloads", "appdata", "temp", "other", "inaccessible",
    ];
    let detailed: Vec<NamedSize> = det_order
        .into_iter()
        .filter_map(|k| detailed_map.remove(k))
        .collect();

    let file_types_keys = ["image", "video", "document", "music", "archive", "other"];
    let file_types: Vec<NamedSize> = file_types_keys
        .into_iter()
        .map(|k| {
            let base_bytes = scan.file_types.get(k).copied().unwrap_or(0);
            let b = if k == "other" { base_bytes + inaccessible_bytes } else { base_bytes };
            NamedSize {
                key: k.into(),
                label: kind_label(k).into(),
                bytes: b,
                percent: (b as f64 / used) * 100.0,
                color: kind_color(k).into(),
            }
        })
        .collect();

    ScanSummary {
        drive: scan.drive.clone(),
        scanned_at: scan.scanned_at,
        scanned_bytes: scan.scanned_bytes,
        file_count: scan.file_count,
        dir_count: scan.dir_count,
        inaccessible_bytes,
        inaccessible_count: scan.inaccessible_count,
        dashboard,
        detailed,
        file_types,
        recent_files: scan.recent_files.clone(),
        large_files: scan.large_files.clone(),
    }
}

fn types_of(folder: &FolderStat) -> Vec<NamedSize> {
    let total = folder.size.max(1) as f64;
    let mut list: Vec<NamedSize> = folder
        .types
        .iter()
        .map(|(k, &bytes)| NamedSize {
            key: k.clone(),
            label: kind_label(k).into(),
            bytes,
            percent: (bytes as f64 / total) * 100.0,
            color: kind_color(k).into(),
        })
        .collect();
    list.sort_by_key(|a| std::cmp::Reverse(a.bytes));
    list
}

pub fn list_folder(scan: Option<&DriveScan>, dir_path: &str) -> FolderDetail {
    let used = scan.map(|s| s.drive.used).unwrap_or(1) as f64;
    let cached = scan.and_then(|s| s.folders.get(dir_path));

    let p = Path::new(dir_path);
    let name = cached
        .map(|c| c.name.clone())
        .or_else(|| p.file_name().map(|s| s.to_string_lossy().to_string()))
        .unwrap_or_else(|| dir_path.to_string());

    let entries = match fs::read_dir(p) {
        Ok(e) => e,
        Err(_) => {
            return FolderDetail {
                name,
                path: dir_path.to_string(),
                size: cached.map(|c| c.size),
                file_count: cached.map(|c| c.file_count),
                dir_count: cached.map(|c| c.dir_count),
                mtime: cached.map(|c| c.mtime),
                percent: cached.map(|c| (c.size as f64 / used) * 100.0).unwrap_or(0.0),
                types: Vec::new(),
                children: Vec::new(),
                inaccessible: true,
                note: Some("Zugriff verweigert".into()),
            };
        }
    };

    let mut children = Vec::new();
    for entry_res in entries {
        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        let child_name = entry.file_name().to_string_lossy().to_string();
        let child_full = entry.path().to_string_lossy().to_string();

        if file_type.is_dir() {
            let st = scan.and_then(|s| s.folders.get(&child_full));
            children.push(FolderChild {
                name: child_name,
                path: child_full,
                is_dir: true,
                size: st.map(|s| s.size),
                file_count: st.map(|s| s.file_count),
                dir_count: st.map(|s| s.dir_count),
                mtime: st.map(|s| s.mtime),
                percent: st.map(|s| (s.size as f64 / used) * 100.0).unwrap_or(0.0),
                types: st.map(types_of).unwrap_or_default(),
                inaccessible: scan.is_some() && st.is_none(),
                note: if st.is_some() {
                    None
                } else {
                    Some("Größe nach Scan verfügbar".into())
                },
            });
        } else if file_type.is_file() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => {
                    children.push(FolderChild {
                        name: child_name,
                        path: child_full,
                        is_dir: false,
                        size: None,
                        file_count: None,
                        dir_count: None,
                        mtime: None,
                        percent: 0.0,
                        types: Vec::new(),
                        inaccessible: true,
                        note: Some("Zugriff verweigert".into()),
                    });
                    continue;
                }
            };

            let size = meta.len();
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);

            let ext = file_ext(&child_name);
            let kind = file_kind(&ext).to_string();

            children.push(FolderChild {
                name: child_name,
                path: child_full,
                is_dir: false,
                size: Some(size),
                file_count: None,
                dir_count: None,
                mtime,
                percent: (size as f64 / used) * 100.0,
                types: vec![NamedSize {
                    key: kind.clone(),
                    label: kind_label(&kind).into(),
                    bytes: size,
                    percent: 100.0,
                    color: kind_color(&kind).into(),
                }],
                inaccessible: false,
                note: None,
            });
        }
    }

    children.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return if a.is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        b.size.unwrap_or(0).cmp(&a.size.unwrap_or(0))
    });

    FolderDetail {
        name,
        path: dir_path.to_string(),
        size: cached.map(|c| c.size),
        file_count: cached.map(|c| c.file_count),
        dir_count: cached.map(|c| c.dir_count),
        mtime: cached.map(|c| c.mtime),
        percent: cached.map(|c| (c.size as f64 / used) * 100.0).unwrap_or(0.0),
        types: cached.map(types_of).unwrap_or_default(),
        children,
        inaccessible: false,
        note: None,
    }
}
