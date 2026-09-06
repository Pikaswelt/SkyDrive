#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Category {
    Windows,
    Programs,
    Games,
    Engines,
    Documents,
    Pictures,
    Videos,
    Music,
    Downloads,
    AppData,
    Temp,
    Other,
}

impl Category {
    pub fn key(self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Programs => "programs",
            Self::Games => "games",
            Self::Engines => "engines",
            Self::Documents => "documents",
            Self::Pictures => "pictures",
            Self::Videos => "videos",
            Self::Music => "music",
            Self::Downloads => "downloads",
            Self::AppData => "appdata",
            Self::Temp => "temp",
            Self::Other => "other",
        }
    }

    pub fn detailed_label(self) -> &'static str {
        match self {
            Self::Windows => "Windows",
            Self::Programs => "Installierte Programme",
            Self::Games => "Spiele",
            Self::Engines => "Game Engines",
            Self::Documents => "Benutzerdateien",
            Self::Pictures => "Bilder",
            Self::Videos => "Videos",
            Self::Music => "Musik",
            Self::Downloads => "Downloads",
            Self::AppData => "AppData",
            Self::Temp => "Temporäre Dateien",
            Self::Other => "Sonstige Dateien",
        }
    }

    pub fn dashboard_key(self) -> &'static str {
        match self {
            Self::Programs | Self::Engines => "programme",
            Self::Games => "spiele",
            Self::Documents | Self::Downloads => "dokumente",
            Self::Pictures | Self::Videos => "media",
            _ => "sonstiges",
        }
    }

    pub fn dashboard_label(self) -> &'static str {
        match self.dashboard_key() {
            "programme" => "Programme",
            "spiele" => "Spiele",
            "dokumente" => "Dokumente",
            "media" => "Bilder & Videos",
            _ => "Sonstiges",
        }
    }

    pub fn dashboard_color(self) -> &'static str {
        match self.dashboard_key() {
            "programme" => "#8b7cff",
            "spiele" => "#f472b6",
            "dokumente" => "#7dd3fc",
            "media" => "#fde68a",
            _ => "#fdba74",
        }
    }

    pub fn detailed_color(self) -> &'static str {
        match self {
            Self::Windows => "#64748b",
            Self::Programs => "#8b7cff",
            Self::Games => "#f472b6",
            Self::Engines => "#a78bfa",
            Self::Documents => "#7dd3fc",
            Self::Pictures => "#2dd4bf",
            Self::Videos => "#fb7185",
            Self::Music => "#c084fc",
            Self::Downloads => "#38bdf8",
            Self::AppData => "#94a3b8",
            Self::Temp => "#fbbf24",
            Self::Other => "#fdba74",
        }
    }
}

fn norm(path: &str) -> String {
    path.replace('\\', "/").to_ascii_lowercase()
}

pub fn classify_path(path: &str) -> Category {
    let s = norm(path);

    if is_temp(&s) {
        return Category::Temp;
    }
    if is_engine(&s) {
        return Category::Engines;
    }
    if is_game(&s) {
        return Category::Games;
    }
    if is_windows(&s) {
        return Category::Windows;
    }
    if is_program(&s) {
        return Category::Programs;
    }
    if is_download(&s) {
        return Category::Downloads;
    }
    if is_appdata(&s) {
        return Category::AppData;
    }
    if is_pictures(&s) {
        return Category::Pictures;
    }
    if is_videos(&s) {
        return Category::Videos;
    }
    if is_music(&s) {
        return Category::Music;
    }
    if is_documents(&s) {
        return Category::Documents;
    }
    Category::Other
}

fn is_temp(s: &str) -> bool {
    s.contains("/temp/")
        || s.contains("/tmp/")
        || s.contains("/tmp") && s.ends_with("/tmp")
        || s.contains("/windows/temp")
        || s.contains("/appdata/local/temp")
        || s.contains("/temporary internet files")
        || s.contains("/temporary/")
        || s.contains("/.cache/")
        || s.contains("/library/caches")
        || s.contains("/prefetch/")
        || s.contains("/internet cache")
        || s.contains("/code cache")
        || s.contains("/gpuCache")
        || s.contains("/gpucache")
}

fn is_engine(s: &str) -> bool {
    s.contains("unrealengine")
        || s.contains("/ue_5")
        || s.contains("/ue_4")
        || s.contains("epic games/ue_")
        || s.contains("/unity/hub")
        || s.contains("unity editors")
        || s.contains("/unity/editor")
        || s.contains("/godot/")
        || s.contains("godotengine")
        || (s.contains("/engines/") && (s.contains("unreal") || s.contains("unity") || s.contains("godot")))
}

fn is_game(s: &str) -> bool {
    s.contains("steamapps/common")
        || s.contains("steamapps\\common")
        || s.contains("/steamapps/")
        || s.contains("/epic games/")
        || s.contains("/epicgames/")
        || s.contains("ubisoft game launcher")
        || s.contains("/ubisoft/")
        || s.contains("battle.net")
        || s.contains("/battlenet/")
        || s.contains("/riot games/")
        || s.contains("/xboxgames/")
        || s.contains("/xbox games/")
        || s.contains("microsoft xbox")
        || s.contains("/gog galaxy/games")
        || s.contains("/gog games/")
        || s.contains("/origin games/")
        || s.contains("/ea games/")
        || s.contains("/legendary/")
        || s.contains("/itch/apps")
        || s.contains("/heroic/prefixes")
        || s.contains("/lutris/")
        || (s.contains("/games/") && !s.contains("/game engines"))
}

fn is_windows(s: &str) -> bool {
    s.contains("/windows/winsxs")
        || s.contains("/windows/system32")
        || s.contains("/windows/syswow64")
        || s.contains("/windows/servicing")
        || s.contains("/windows/assembly")
        || s.contains("/windows/fonts")
        || s.contains("/windows/installer")
        || s.contains("/windows/softwareDistribution")
        || s.contains("/windows/softwaredistribution")
        || s.contains("/windows/systemapps")
        || s.contains("/windows/systemui")
        || s.contains("/windows/winre")
        || s.contains("/windows/logs")
        || s.contains("/$recycle.bin")
        || s.contains("/system volume information")
        || s.contains("/recovery/")
        || s.contains("/programdata/microsoft/windows")
        || s.contains("/windows/")
        || s.ends_with("/windows")
}

fn is_program(s: &str) -> bool {
    s.contains("/program files/")
        || s.contains("/program files (x86)/")
        || s.contains("/programfiles/")
        || s.contains("/applications/")
        || s.contains("/usr/lib/")
        || s.contains("/usr/share/")
        || s.contains("/usr/bin/")
        || s.contains("/usr/local/")
        || s.contains("/opt/")
        || s.contains("/programdata/")
        || s.contains("/library/application support/")
}

fn is_download(s: &str) -> bool {
    s.contains("/downloads/") || s.contains("/download/") || s.ends_with("/downloads")
}

fn is_appdata(s: &str) -> bool {
    s.contains("/appdata/local/")
        || s.contains("/appdata/roaming/")
        || s.contains("/appdata/locallow/")
        || s.contains("/appdata/")
        || s.contains("/.local/share/")
        || s.contains("/.config/")
        || s.contains("/library/application support")
}

fn is_pictures(s: &str) -> bool {
    s.contains("/pictures/")
        || s.contains("/bilder/")
        || s.contains("/dcim/")
        || s.contains("/screenshots/")
        || s.ends_with("/pictures")
        || s.ends_with("/bilder")
}

fn is_videos(s: &str) -> bool {
    s.contains("/videos/")
        || s.contains("/movies/")
        || s.contains("/filme/")
        || s.ends_with("/videos")
        || s.ends_with("/movies")
}

fn is_music(s: &str) -> bool {
    s.contains("/music/")
        || s.contains("/musik/")
        || s.contains("/itunes/")
        || s.ends_with("/music")
        || s.ends_with("/musik")
}

fn is_documents(s: &str) -> bool {
    s.contains("/documents/")
        || s.contains("/dokumente/")
        || s.contains("/desktop/")
        || s.contains("/onedrive/")
        || s.ends_with("/documents")
        || s.ends_with("/dokumente")
        || s.ends_with("/desktop")
}

pub fn should_skip_dir(path: &str) -> bool {
    let s = norm(path);
    let names = [
        "/proc",
        "/sys",
        "/dev",
        "/run",
        "/snap",
        "/boot/efi",
        "/var/lib/docker",
        "/var/lib/containerd",
        "/var/lib/snapd/snaps",
        "/system/volumes/preboot",
        "/system/volumes/update",
        "/system/volumes/vm",
        "/network",
        "/cores",
        "/lost+found",
    ];
    for n in names {
        if s == n || s.starts_with(&format!("{n}/")) {
            return true;
        }
    }
    if s.contains("/.trashes/") {
        return false;
    }
    false
}

pub fn is_virtual_fs(fs: &str) -> bool {
    let f = fs.to_ascii_lowercase();
    matches!(
        f.as_str(),
        "tmpfs"
            | "devtmpfs"
            | "devfs"
            | "proc"
            | "sysfs"
            | "cgroup"
            | "cgroup2"
            | "autofs"
            | "nsfs"
            | "bpf"
            | "tracefs"
            | "debugfs"
            | "securityfs"
            | "pstore"
            | "efivarfs"
            | "ramfs"
            | "fusectl"
            | "hugetlbfs"
            | "mqueue"
            | "configfs"
            | "binfmt_misc"
    ) || f.contains("cgroup")
}
