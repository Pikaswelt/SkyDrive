use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveInfo {
    pub id: String,
    pub name: String,
    pub mount: String,
    pub total: u64,
    pub used: u64,
    pub free: u64,
    pub fs: String,
    pub kind: String,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub username: String,
    pub display_name: String,
    pub home: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub drive: String,
    pub status: String,
    pub current_path: String,
    pub files_scanned: u64,
    pub dirs_scanned: u64,
    pub bytes_scanned: u64,
    pub percent: f32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamedSize {
    pub key: String,
    pub label: String,
    pub bytes: u64,
    pub percent: f64,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mtime: i64,
    pub ext: String,
    pub kind: String,
    pub inaccessible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderChild {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub file_count: Option<u64>,
    pub dir_count: Option<u64>,
    pub mtime: Option<i64>,
    pub percent: f64,
    pub types: Vec<NamedSize>,
    pub inaccessible: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderDetail {
    pub name: String,
    pub path: String,
    pub size: Option<u64>,
    pub file_count: Option<u64>,
    pub dir_count: Option<u64>,
    pub mtime: Option<i64>,
    pub percent: f64,
    pub types: Vec<NamedSize>,
    pub children: Vec<FolderChild>,
    pub inaccessible: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanSummary {
    pub drive: DriveInfo,
    pub scanned_at: i64,
    pub scanned_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub inaccessible_bytes: u64,
    pub inaccessible_count: u64,
    pub dashboard: Vec<NamedSize>,
    pub detailed: Vec<NamedSize>,
    pub file_types: Vec<NamedSize>,
    pub recent_files: Vec<FileEntry>,
    pub large_files: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub files: Vec<FileEntry>,
    pub wasted: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateReport {
    pub groups: Vec<DuplicateGroup>,
    pub wasted: u64,
    pub file_count: u64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TempCategory {
    pub key: String,
    pub label: String,
    pub bytes: u64,
    pub file_count: u64,
    pub cautious: bool,
    pub description: String,
    pub samples: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TempReport {
    pub categories: Vec<TempCategory>,
    pub total_bytes: u64,
    pub total_files: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashItem {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionResult {
    pub ok: bool,
    pub message: String,
    pub freed: u64,
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn file_ext(name: &str) -> String {
    std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default()
}

pub fn file_kind(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "heic" | "heif" | "bmp" | "tiff" | "tif"
        | "svg" | "raw" | "cr2" | "nef" | "dng" | "avif" => "image",
        "mp4" | "mkv" | "mov" | "avi" | "webm" | "m4v" | "wmv" | "flv" | "mpeg" | "mpg" => {
            "video"
        }
        "mp3" | "flac" | "wav" | "aac" | "m4a" | "ogg" | "wma" | "aiff" | "opus" => "music",
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "rtf"
        | "odt" | "ods" | "odp" | "csv" | "pages" | "numbers" => "document",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" | "dmg" | "cab" | "tgz" => {
            "archive"
        }
        _ => "other",
    }
}

pub fn kind_label(kind: &str) -> &'static str {
    match kind {
        "image" => "Bilder",
        "video" => "Videos",
        "document" => "Dokumente",
        "music" => "Musik",
        "archive" => "Archive",
        _ => "Sonstiges",
    }
}

pub fn kind_color(kind: &str) -> &'static str {
    match kind {
        "image" => "#2dd4bf",
        "video" => "#fb7185",
        "document" => "#60a5fa",
        "music" => "#c084fc",
        "archive" => "#d97706",
        _ => "#94a3b8",
    }
}

pub fn path_depth(path: &str) -> usize {
    std::path::Path::new(path).components().count()
}

#[derive(Debug, Clone)]
pub struct FolderStat {
    #[allow(dead_code)]
    pub path: String,
    pub name: String,
    pub size: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub mtime: i64,
    pub types: HashMap<String, u64>,
    pub child_dirs: Vec<String>,
    pub inaccessible: bool,
}

#[derive(Debug, Clone)]
pub struct DriveScan {
    pub drive: DriveInfo,
    pub scanned_at: i64,
    pub scanned_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
    pub inaccessible_count: u64,
    pub categories: HashMap<String, u64>,
    pub file_types: HashMap<String, u64>,
    pub folders: HashMap<String, FolderStat>,
    pub large_files: Vec<FileEntry>,
    pub recent_files: Vec<FileEntry>,
    pub size_index: HashMap<u64, Vec<String>>,
}
