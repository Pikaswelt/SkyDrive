use crate::model::*;
use crate::scan::AppState;
use rayon::prelude::*;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

const QUICK: usize = 64 * 1024;

fn quick_hash(path: &Path) -> Option<[u8; 32]> {
    let mut f = File::open(path).ok()?;
    let mut buf = vec![0u8; QUICK];
    let n = f.read(&mut buf).ok()?;
    let mut hasher = blake3::Hasher::new();
    hasher.update(&buf[..n]);
    if let Ok(meta) = f.metadata() {
        if meta.len() > QUICK as u64 {
            let _ = f.seek(SeekFrom::End(-(QUICK as i64).min(meta.len() as i64)));
            let mut end = vec![0u8; QUICK];
            if let Ok(m) = f.read(&mut end) {
                hasher.update(&end[..m]);
            }
        }
        hasher.update(&meta.len().to_le_bytes());
    }
    Some(*hasher.finalize().as_bytes())
}

fn full_hash(path: &Path) -> Option<String> {
    let mut f = File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hasher.finalize().to_hex().to_string())
}

fn entry_from(path: &str) -> FileEntry {
    let p = Path::new(path);
    let name = p
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let meta = std::fs::metadata(p).ok();
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let mtime = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let ext = file_ext(&name);
    let kind = file_kind(&ext).to_string();
    FileEntry {
        name,
        path: path.to_string(),
        size,
        mtime,
        ext,
        kind,
        inaccessible: meta.is_none(),
    }
}

pub fn find_duplicates(state: &AppState, mount: &str) -> Result<DuplicateReport, String> {
    let scans = state.scans.lock();
    let scan = scans
        .get(mount)
        .ok_or_else(|| "Bitte zuerst das Laufwerk scannen.".to_string())?;

    let candidates: Vec<(u64, Vec<String>)> = scan
        .size_index
        .iter()
        .filter(|(_, v)| v.len() > 1)
        .map(|(k, v)| (*k, v.clone()))
        .collect();
    drop(scans);

    // Phase 1: quick hash
    let mut quick_groups: std::collections::HashMap<(u64, [u8; 32]), Vec<String>> =
        std::collections::HashMap::new();
    for (size, paths) in candidates {
        let hashed: Vec<(String, [u8; 32])> = paths
            .par_iter()
            .filter_map(|p| quick_hash(Path::new(p)).map(|h| (p.clone(), h)))
            .collect();
        for (p, h) in hashed {
            quick_groups.entry((size, h)).or_default().push(p);
        }
    }

    // Phase 2: full hash for remaining groups
    let mut groups: Vec<DuplicateGroup> = Vec::new();
    for ((size, _), paths) in quick_groups {
        if paths.len() < 2 {
            continue;
        }
        let mut full: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        let hashed: Vec<(String, String)> = paths
            .par_iter()
            .filter_map(|p| full_hash(Path::new(p)).map(|h| (p.clone(), h)))
            .collect();
        for (p, h) in hashed {
            full.entry(h).or_default().push(p);
        }
        for (hash, files) in full {
            if files.len() < 2 {
                continue;
            }
            let entries: Vec<FileEntry> = files.iter().map(|p| entry_from(p)).collect();
            let wasted = size.saturating_mul((entries.len() as u64).saturating_sub(1));
            groups.push(DuplicateGroup {
                hash,
                size,
                files: entries,
                wasted,
            });
        }
    }

    groups.sort_by_key(|g| std::cmp::Reverse(g.wasted));
    let wasted: u64 = groups.iter().map(|g| g.wasted).sum();
    let file_count: u64 = groups.iter().map(|g| g.files.len() as u64).sum();
    Ok(DuplicateReport {
        groups,
        wasted,
        file_count,
        status: "ok".into(),
    })
}

pub fn temp_report(state: &AppState, mount: &str) -> TempReport {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let tmp = std::env::temp_dir();
    let mut cats: Vec<(String, String, String, bool, String)> = vec![
        (
            "user-temp".into(),
            "Benutzer-Temp".into(),
            tmp.to_string_lossy().to_string(),
            false,
            "Temporäre Dateien des Benutzerkontos. In der Regel sicher löschbar, solange keine Programme geöffnet sind.".into(),
        ),
    ];

    #[cfg(windows)]
    {
        cats.push((
            "win-temp".into(),
            "Windows\\Temp".into(),
            "C:\\Windows\\Temp".into(),
            true,
            "Systemtemp. Nur löschen, wenn Windows nicht gerade Updates installiert.".into(),
        ));
        cats.push((
            "prefetch".into(),
            "Prefetch (Vorsicht)".into(),
            "C:\\Windows\\Prefetch".into(),
            true,
            "Kann den Start bekannter Programme kurzfristig verlangsamen.".into(),
        ));
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            cats.push((
                "thumb".into(),
                "Miniaturansichten".into(),
                format!("{local}\\Microsoft\\Windows\\Explorer"),
                false,
                "Thumbnail-Cache. Wird bei Bedarf neu aufgebaut.".into(),
            ));
        }
    }
    #[cfg(not(windows))]
    {
        cats.push((
            "var-tmp".into(),
            "/var/tmp".into(),
            "/var/tmp".into(),
            false,
            "Systemweite temporäre Dateien.".into(),
        ));
        cats.push((
            "user-cache".into(),
            "Benutzer-Cache".into(),
            format!("{home}/.cache"),
            false,
            "Anwendungs-Caches. Meist unkritisch.".into(),
        ));
        cats.push((
            "thumb".into(),
            "Miniaturansichten".into(),
            format!("{home}/.cache/thumbnails"),
            false,
            "Vorschaubilder. Werden neu erzeugt.".into(),
        ));
    }

    // Also include scanned temp category samples
    let mut out = Vec::new();
    let mut total_bytes = 0u64;
    let mut total_files = 0u64;

    for (key, label, dir, cautious, description) in cats {
        if !std::path::Path::new(&dir).exists() {
            continue;
        }
        let (bytes, count, samples) = summarize_dir(&dir, 12);
        if count == 0 && bytes == 0 {
            continue;
        }
        total_bytes += bytes;
        total_files += count;
        out.push(TempCategory {
            key,
            label,
            bytes,
            file_count: count,
            cautious,
            description,
            samples,
        });
    }

    if let Some(scan) = state.scans.lock().get(mount) {
        if let Some(b) = scan.categories.get("temp") {
            if *b > 0 && !out.iter().any(|c| c.key == "scanned-temp") {
                let samples: Vec<FileEntry> = scan
                    .large_files
                    .iter()
                    .filter(|f| crate::classify::classify_path(&f.path) == crate::classify::Category::Temp)
                    .cloned()
                    .take(8)
                    .collect();
                out.push(TempCategory {
                    key: "scanned-temp".into(),
                    label: "Erkannte Temp-Dateien".into(),
                    bytes: *b,
                    file_count: samples.len() as u64,
                    cautious: false,
                    description: "Während des Scans als temporär erkannte Dateien.".into(),
                    samples,
                });
            }
        }
    }

    TempReport {
        categories: out,
        total_bytes,
        total_files,
    }
}

fn summarize_dir(dir: &str, sample_n: usize) -> (u64, u64, Vec<FileEntry>) {
    let mut bytes = 0u64;
    let mut count = 0u64;
    let mut samples = Vec::new();
    for entry in jwalk::WalkDir::new(dir).follow_links(false).max_depth(6) {
        let Ok(e) = entry else { continue };
        if !e.file_type().is_file() {
            continue;
        }
        let Ok(meta) = std::fs::metadata(e.path()) else { continue };
        bytes += meta.len();
        count += 1;
        if samples.len() < sample_n {
            let name = e.file_name().to_string_lossy().to_string();
            let ext = file_ext(&name);
            samples.push(FileEntry {
                name,
                path: e.path().to_string_lossy().to_string(),
                size: meta.len(),
                mtime: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0),
                ext: ext.clone(),
                kind: file_kind(&ext).into(),
                inaccessible: false,
            });
        }
    }
    (bytes, count, samples)
}

pub fn list_downloads(state: &AppState, mount: &str) -> Vec<FileEntry> {
    let mut dirs = Vec::new();
    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        dirs.push(format!("{home}/Downloads"));
        dirs.push(format!("{home}/downloads"));
    }
    #[cfg(windows)]
    {
        if let Ok(user) = std::env::var("USERPROFILE") {
            dirs.push(format!("{user}\\Downloads"));
        }
    }

    let mut files = Vec::new();
    for d in dirs {
        let p = std::path::Path::new(&d);
        if !p.is_dir() {
            continue;
        }
        if let Ok(rd) = std::fs::read_dir(p) {
            for ent in rd.flatten() {
                let meta = ent.metadata().ok();
                let is_file = meta.as_ref().map(|m| m.is_file()).unwrap_or(false);
                if !is_file {
                    continue;
                }
                let name = ent.file_name().to_string_lossy().to_string();
                let ext = file_ext(&name);
                files.push(FileEntry {
                    name,
                    path: ent.path().to_string_lossy().to_string(),
                    size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    mtime: meta
                        .as_ref()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0),
                    ext: ext.clone(),
                    kind: file_kind(&ext).into(),
                    inaccessible: meta.is_none(),
                });
            }
        }
    }
    if files.is_empty() {
        if let Some(scan) = state.scans.lock().get(mount) {
            return scan
                .recent_files
                .iter()
                .filter(|f| crate::classify::classify_path(&f.path) == crate::classify::Category::Downloads)
                .cloned()
                .collect();
        }
    }
    files.sort_by_key(|f| std::cmp::Reverse(f.mtime));
    files
}

pub fn list_trash() -> Vec<TrashItem> {
    let mut items = Vec::new();
    let mut roots = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        roots.push(format!("{home}/.local/share/Trash/files"));
        roots.push(format!("{home}/.Trash"));
    }
    #[cfg(windows)]
    {
        // Recycle bin is not a normal folder; try common path
        for letter in b'C'..=b'Z' {
            let p = format!("{}:\\$Recycle.Bin", letter as char);
            if std::path::Path::new(&p).exists() {
                roots.push(p);
            }
        }
    }
    for root in roots {
        let p = std::path::Path::new(&root);
        if !p.is_dir() {
            continue;
        }
        if let Ok(rd) = std::fs::read_dir(p) {
            for ent in rd.flatten() {
                let meta = ent.metadata().ok();
                let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                let size = if is_dir {
                    dir_size_shallow(&ent.path())
                } else {
                    meta.as_ref().map(|m| m.len()).unwrap_or(0)
                };
                items.push(TrashItem {
                    name: ent.file_name().to_string_lossy().to_string(),
                    path: ent.path().to_string_lossy().to_string(),
                    size,
                    is_dir,
                });
            }
        }
    }
    items.sort_by_key(|i| std::cmp::Reverse(i.size));
    items
}

fn dir_size_shallow(path: &std::path::Path) -> u64 {
    let mut n = 0u64;
    if let Ok(rd) = std::fs::read_dir(path) {
        for ent in rd.flatten() {
            if let Ok(m) = ent.metadata() {
                if m.is_file() {
                    n += m.len();
                }
            }
        }
    }
    n
}
