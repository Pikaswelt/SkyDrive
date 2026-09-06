use crate::model::ActionResult;
use std::path::Path;

pub fn open_path(path: &str) -> Result<ActionResult, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err("Pfad nicht gefunden.".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(ActionResult {
        ok: true,
        message: "Geöffnet.".into(),
        freed: 0,
    })
}

pub fn reveal_path(path: &str) -> Result<ActionResult, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err("Pfad nicht gefunden.".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let parent = p.parent().unwrap_or(p);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(ActionResult {
        ok: true,
        message: "Speicherort angezeigt.".into(),
        freed: 0,
    })
}

pub fn delete_paths(paths: Vec<String>, to_trash: bool) -> Result<ActionResult, String> {
    if paths.is_empty() {
        return Err("Keine Dateien ausgewählt.".into());
    }
    let mut freed = 0u64;
    let mut errors = Vec::new();
    for path in &paths {
        if is_protected(path) {
            errors.push(format!("Geschützt: {path}"));
            continue;
        }
        let p = Path::new(path);
        let sz = size_of(p);
        if to_trash {
            if let Err(e) = trash::delete(path) {
                errors.push(format!("{path}: {e}"));
                continue;
            }
        } else if p.is_dir() {
            if let Err(e) = std::fs::remove_dir_all(p) {
                errors.push(format!("{path}: {e}"));
                continue;
            }
        } else if let Err(e) = std::fs::remove_file(p) {
            errors.push(format!("{path}: {e}"));
            continue;
        }
        freed += sz;
    }
    if errors.is_empty() {
        Ok(ActionResult {
            ok: true,
            message: format!("{} Element(e) entfernt.", paths.len()),
            freed,
        })
    } else if freed > 0 {
        Ok(ActionResult {
            ok: true,
            message: format!("Teilweise entfernt. {}", errors.join(" · ")),
            freed,
        })
    } else {
        Err(errors.join(" · "))
    }
}

pub fn empty_trash() -> Result<ActionResult, String> {
    let items = crate::duplicates::list_trash();
    if items.is_empty() {
        return Ok(ActionResult {
            ok: true,
            message: "Papierkorb ist bereits leer.".into(),
            freed: 0,
        });
    }
    let paths: Vec<String> = items.into_iter().map(|i| i.path).collect();
    // Permanent delete from trash locations
    delete_paths(paths, false)
}

fn size_of(p: &Path) -> u64 {
    if let Ok(m) = std::fs::metadata(p) {
        if m.is_file() {
            return m.len();
        }
    }
    0
}

fn is_protected(path: &str) -> bool {
    let s = path.replace('\\', "/").to_ascii_lowercase();
    let needles = [
        "/windows/system32",
        "/windows/syswow64",
        "/windows/winsxs",
        "/windows/servicing",
        "/system32/",
        "/usr/bin",
        "/usr/sbin",
        "/bin/",
        "/sbin/",
        "/system/library",
        "/windows/explorer.exe",
        "/windows/systemapps",
    ];
    needles.iter().any(|n| s.contains(n))
}
