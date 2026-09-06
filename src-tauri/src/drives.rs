use crate::model::DriveInfo;
use sysinfo::Disks;

pub fn list_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut out = Vec::new();
    for disk in disks.list() {
        let fs = disk.file_system().to_string_lossy().to_string();
        if crate::classify::is_virtual_fs(&fs) {
            continue;
        }
        let mount = disk.mount_point().to_string_lossy().to_string();
        if crate::classify::should_skip_dir(&mount) {
            continue;
        }
        // Skip tiny system mounts
        if disk.total_space() < 64 * 1024 * 1024 {
            continue;
        }
        let name = disk.name().to_string_lossy().to_string();
        let kind = format!("{:?}", disk.kind());
        let is_removable = disk.is_removable();
        let total = disk.total_space();
        let free = disk.available_space();
        let used = total.saturating_sub(free);
        let display = drive_display_name(&mount, &name, is_removable);
        out.push(DriveInfo {
            id: mount.clone(),
            name: display,
            mount,
            total,
            used,
            free,
            fs,
            kind,
            is_removable,
        });
    }
    out.sort_by(|a, b| {
        drive_sort_key(&a.mount).cmp(&drive_sort_key(&b.mount))
    });
    // Deduplicate overlapping mounts that share the same device name + size
    let mut unique: Vec<DriveInfo> = Vec::new();
    for d in out {
        if unique.iter().any(|u| u.mount == d.mount) {
            continue;
        }
        unique.push(d);
    }
    unique
}

fn drive_display_name(mount: &str, name: &str, removable: bool) -> String {
    let m = mount.replace('\\', "/");
    #[cfg(windows)]
    {
        let letter = m.trim_end_matches('/').trim_end_matches(':');
        if m.len() <= 3 {
            let label = if name.trim().is_empty() {
                "Lokaler Datenträger"
            } else {
                name.trim()
            };
            return format!("{label} ({})", mount.trim_end_matches('\\'));
        }
        let _ = letter;
    }
    if m == "/" {
        if name.trim().is_empty() {
            return "System (/)".into();
        }
        return format!("{name} (/)");
    }
    if removable {
        if name.trim().is_empty() {
            return format!("Wechseldatenträger ({mount})");
        }
        return format!("{name} ({mount})");
    }
    if !name.trim().is_empty() && name != mount {
        return format!("{name} ({mount})");
    }
    mount.to_string()
}

fn drive_sort_key(mount: &str) -> String {
    let m = mount.replace('\\', "/").to_ascii_uppercase();
    if m == "/" || m == "C:/" || m == "C:" {
        return "0".into();
    }
    format!("1{m}")
}

pub fn refresh_drive(mount: &str) -> Option<DriveInfo> {
    list_drives().into_iter().find(|d| d.mount == mount)
}
