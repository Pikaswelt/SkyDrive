use crate::model::{FileEntry, ScanResult, ScanStats};
use crate::classify;
use crate::duplicates;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use walkdir::WalkDir;

pub fn scan_directory(root: &str) -> Result<ScanResult, String> {
    let root_path = Path::new(root);
    if !root_path.exists() {
        return Err(format!("Path does not exist: {}", root));
    }
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root));
    }

    let start = Instant::now();
    let mut files: Vec<FileEntry> = Vec::new();
    let mut total_size: u64 = 0;
    let mut category_sizes: HashMap<String, u64> = HashMap::new();
    let mut category_counts: HashMap<String, u64> = HashMap::new();

    for entry in WalkDir::new(root_path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let metadata = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let size = metadata.len();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        let category = classify::classify_extension(&ext);
        let relative = path
            .strip_prefix(root_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        total_size += size;
        category_sizes
            .entry(category.clone())
            .and_modify(|v| *v += size)
            .or_insert(size);
        category_counts
            .entry(category.clone())
            .and_modify(|v| *v += 1)
            .or_insert(1);

        files.push(FileEntry {
            path: relative,
            size,
            extension: ext,
            category,
            modified,
        });
    }

    let duplicate_groups = duplicates::find_duplicates(&files);
    let duplicate_waste: u64 = duplicate_groups
        .iter()
        .map(|g| g.wasted_bytes)
        .sum();

    let elapsed = start.elapsed().as_millis() as u64;

    Ok(ScanResult {
        root: root.to_string(),
        files,
        stats: ScanStats {
            total_files: files.len() as u64,
            total_size,
            category_sizes,
            category_counts,
            duplicate_groups: duplicate_groups.len() as u64,
            duplicate_waste,
            scan_duration_ms: elapsed,
        },
        duplicate_groups,
    })
}

pub fn get_drives() -> Vec<String> {
    let mut drives = Vec::new();

    if cfg!(target_os = "windows") {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if Path::new(&drive).exists() {
                drives.push(drive);
            }
        }
    } else if cfg!(target_os = "macos") {
        drives.push("/".to_string());
        drives.push("/Users".to_string());
        if let Ok(home) = std::env::var("HOME") {
            drives.push(home);
        }
        if Path::new("/Volumes").exists() {
            if let Ok(entries) = fs::read_dir("/Volumes") {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        drives.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
    } else {
        drives.push("/".to_string());
        drives.push("/home".to_string());
        if let Ok(home) = std::env::var("HOME") {
            drives.push(home);
        }
    }

    drives
}
