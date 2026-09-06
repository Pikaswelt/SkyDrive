import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execSync } from "node:child_process"
import crypto from "node:crypto"

export const clients = new Set()

const state = {
  scans: new Map(),
  progress: {
    drive: "",
    status: "idle",
    current_path: "",
    files_scanned: 0,
    dirs_scanned: 0,
    bytes_scanned: 0,
    percent: 0,
    message: "Bereit",
  },
  cancel: false,
  scanning: false,
}

function emit(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) {
    try {
      res.write(payload)
    } catch {
      clients.delete(res)
    }
  }
}

function setProgress(p) {
  state.progress = { ...state.progress, ...p }
  emit("scan-progress", state.progress)
}

function norm(p) {
  return p.replaceAll("\\", "/").toLowerCase()
}

function shouldSkip(p) {
  const s = norm(p)
  return [
    "/proc",
    "/sys",
    "/dev",
    "/run",
    "/snap",
    "/boot/efi",
    "/var/lib/docker",
    "/var/lib/containerd",
    "/var/lib/snapd/snaps",
    "/lost+found",
  ].some((n) => s === n || s.startsWith(n + "/"))
}

function isVirtualFs(fsType) {
  const f = String(fsType).toLowerCase()
  return /^(tmpfs|devtmpfs|proc|sysfs|cgroup|cgroup2|autofs|nsfs|bpf|tracefs|debugfs|securityfs|ramfs)$/.test(
    f,
  )
}

function classify(p) {
  const s = norm(p)
  const has = (...xs) => xs.some((x) => s.includes(x))
  if (has("/temp/", "/tmp/", "/windows/temp", "/appdata/local/temp", "/.cache/", "/library/caches")) return "temp"
  if (has("unrealengine", "/ue_5", "/ue_4", "/unity/hub", "unity editors", "/godot/")) return "engines"
  if (
    has(
      "steamapps/common",
      "/steamapps/",
      "/epic games/",
      "/ubisoft/",
      "battle.net",
      "/riot games/",
      "/xboxgames/",
      "/gog galaxy/games",
      "/games/",
    )
  )
    return "games"
  if (has("/windows/", "/$recycle.bin", "/system volume information", "/programdata/microsoft/windows")) return "windows"
  if (has("/program files/", "/program files (x86)/", "/applications/", "/usr/lib/", "/usr/share/", "/opt/"))
    return "programs"
  if (has("/downloads/", "/download/")) return "downloads"
  if (has("/appdata/", "/.local/share/", "/.config/")) return "appdata"
  if (has("/pictures/", "/bilder/", "/dcim/", "/screenshots/")) return "pictures"
  if (has("/videos/", "/movies/", "/filme/")) return "videos"
  if (has("/music/", "/musik/")) return "music"
  if (has("/documents/", "/dokumente/", "/desktop/", "/onedrive/")) return "documents"
  return "other"
}

function fileExt(name) {
  const i = name.lastIndexOf(".")
  return i > 0 ? name.slice(i + 1).toLowerCase() : ""
}

function fileKind(ext) {
  if (/^(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|tif|svg|raw|cr2|nef|dng|avif)$/.test(ext)) return "image"
  if (/^(mp4|mkv|mov|avi|webm|m4v|wmv|flv|mpeg|mpg)$/.test(ext)) return "video"
  if (/^(mp3|flac|wav|aac|m4a|ogg|wma|aiff|opus)$/.test(ext)) return "music"
  if (/^(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|rtf|odt|ods|odp|csv)$/.test(ext)) return "document"
  if (/^(zip|rar|7z|tar|gz|bz2|xz|iso|dmg|cab|tgz)$/.test(ext)) return "archive"
  return "other"
}

const KIND_LABEL = {
  image: "Bilder",
  video: "Videos",
  document: "Dokumente",
  music: "Musik",
  archive: "Archive",
  other: "Sonstiges",
}
const KIND_COLOR = {
  image: "#2dd4bf",
  video: "#fb7185",
  document: "#60a5fa",
  music: "#c084fc",
  archive: "#d97706",
  other: "#94a3b8",
}

function dashboardOf(cat) {
  if (cat === "programs" || cat === "engines") return ["programme", "Programme", "#8b7cff"]
  if (cat === "games") return ["spiele", "Spiele", "#f472b6"]
  if (cat === "documents" || cat === "downloads") return ["dokumente", "Dokumente", "#7dd3fc"]
  if (cat === "pictures" || cat === "videos") return ["media", "Bilder & Videos", "#fde68a"]
  return ["sonstiges", "Sonstiges", "#fdba74"]
}

function detailedOf(cat) {
  const map = {
    windows: ["windows", "Windows", "#64748b"],
    programs: ["programs", "Installierte Programme", "#8b7cff"],
    games: ["games", "Spiele", "#f472b6"],
    engines: ["engines", "Game Engines", "#a78bfa"],
    documents: ["userfiles", "Benutzerdateien", "#7dd3fc"],
    pictures: ["userfiles", "Benutzerdateien", "#7dd3fc"],
    videos: ["userfiles", "Benutzerdateien", "#7dd3fc"],
    music: ["userfiles", "Benutzerdateien", "#7dd3fc"],
    downloads: ["downloads", "Downloads", "#38bdf8"],
    appdata: ["appdata", "AppData", "#94a3b8"],
    temp: ["temp", "Temporäre Dateien", "#fbbf24"],
    other: ["other", "Sonstige Dateien", "#fdba74"],
  }
  return map[cat] ?? map.other
}

export function listDrives() {
  const out = []
  if (process.platform === "win32") {
    try {
      const raw = execSync(
        "powershell -NoProfile -Command \"Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace,DriveType | ConvertTo-Json\"",
        { encoding: "utf8" },
      )
      const parsed = JSON.parse(raw)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      for (const d of arr) {
        const total = Number(d.Size) || 0
        const free = Number(d.FreeSpace) || 0
        if (total < 64 * 1024 * 1024) continue
        const mount = `${d.DeviceID}\\`
        const label = d.VolumeName || "Lokaler Datenträger"
        out.push({
          id: mount,
          name: `${label} (${d.DeviceID})`,
          mount,
          total,
          used: total - free,
          free,
          fs: d.FileSystem || "",
          kind: String(d.DriveType),
          is_removable: d.DriveType === 2,
        })
      }
    } catch {
      /* fall through */
    }
  } else {
    try {
      const raw = execSync("df -kP", { encoding: "utf8" })
      const lines = raw.trim().split("\n").slice(1)
      for (const line of lines) {
        const parts = line.split(/\s+/)
        if (parts.length < 6) continue
        const [fsname, blocks, usedK, avail, , mount] = parts
        if (isVirtualFs(fsname) || shouldSkip(mount)) continue
        const total = Number(blocks) * 1024
        const used = Number(usedK) * 1024
        const free = Number(avail) * 1024
        if (total < 64 * 1024 * 1024) continue
        const name =
          mount === "/"
            ? `${os.hostname()} (/)`
            : `${path.basename(mount)} (${mount})`
        out.push({
          id: mount,
          name,
          mount,
          total,
          used,
          free,
          fs: fsname,
          kind: "SSD",
          is_removable: /media|mnt|run\/media/.test(mount),
        })
      }
    } catch {
      /* no drives readable */
    }
  }
  out.sort((a, b) => {
    const score = (m) => (m === "/" || /^[cC]:/.test(m) ? 0 : 1)
    return score(a.mount) - score(b.mount)
  })
  const seen = new Set()
  return out.filter((d) => (seen.has(d.mount) ? false : (seen.add(d.mount), true)))
}

export function userProfile() {
  const username = os.userInfo().username
  const display = username.charAt(0).toUpperCase() + username.slice(1)
  return { username, display_name: display, home: os.homedir() }
}

function folderDepth(p) {
  const n = p.replaceAll("\\", "/").replace(/\/+$/, "")
  if (!n || n === "/") return 0
  if (/^[A-Za-z]:$/.test(n)) return 0
  return n.split("/").filter(Boolean).length
}

function sleepTick() {
  return new Promise((r) => setImmediate(r))
}

async function walkScan(drive) {
  const root = drive.mount
  const folders = new Map()
  const categories = new Map()
  const fileTypes = new Map()
  const large = []
  const recent = []
  const sizeIndex = new Map()
  let files = 0
  let dirs = 0
  let bytes = 0
  let inaccessible = 0

  const ensure = (p, mtime = 0) => {
    if (!folders.has(p)) {
      folders.set(p, {
        path: p,
        name: path.basename(p) || p,
        size: 0,
        file_count: 0,
        dir_count: 0,
        mtime,
        types: new Map(),
        child_dirs: [],
        inaccessible: false,
      })
    }
    return folders.get(p)
  }
  ensure(root)

  const stack = [root]
  while (stack.length) {
    if (state.cancel) throw new Error("Scan abgebrochen.")
    const dir = stack.pop()
    if (shouldSkip(dir)) continue
    let entries
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      inaccessible += 1
      continue
    }
    dirs += 1
    const parent = ensure(dir)
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isSymbolicLink()) continue
      if (ent.isDirectory()) {
        if (shouldSkip(full)) continue
        ensure(full)
        if (!parent.child_dirs.includes(full)) parent.child_dirs.push(full)
        stack.push(full)
        continue
      }
      if (!ent.isFile()) continue
      let st
      try {
        st = await fs.promises.stat(full)
      } catch {
        inaccessible += 1
        continue
      }
      const size = st.size
      const mtime = Math.floor(st.mtimeMs / 1000)
      const ext = fileExt(ent.name)
      const kind = fileKind(ext)
      files += 1
      bytes += size
      parent.size += size
      parent.file_count += 1
      if (mtime > parent.mtime) parent.mtime = mtime
      parent.types.set(kind, (parent.types.get(kind) || 0) + size)
      const cat = classify(full)
      categories.set(cat, (categories.get(cat) || 0) + size)
      fileTypes.set(kind, (fileTypes.get(kind) || 0) + size)
      const fe = {
        name: ent.name,
        path: full,
        size,
        mtime,
        ext,
        kind,
        inaccessible: false,
      }
      large.push(fe)
      if (large.length > 800) {
        large.sort((a, b) => b.size - a.size)
        large.length = 400
      }
      recent.push(fe)
      if (recent.length > 400) {
        recent.sort((a, b) => b.mtime - a.mtime)
        recent.length = 60
      }
      if (size >= 4096) {
        const arr = sizeIndex.get(size) || []
        arr.push(full)
        sizeIndex.set(size, arr)
      }
      if (files % 200 === 0) {
        const percent = Math.min(99, (bytes / Math.max(drive.used, 1)) * 99)
        setProgress({
          drive: drive.mount,
          status: "scanning",
          current_path: full,
          files_scanned: files,
          dirs_scanned: dirs,
          bytes_scanned: bytes,
          percent,
          message: `Analysiere ${drive.name}`,
        })
        await sleepTick()
      }
    }
  }

  setProgress({ status: "aggregating", message: "Werte werden zusammengeführt …" })

  const paths = [...folders.keys()].sort((a, b) => folderDepth(b) - folderDepth(a))
  for (const p of paths) {
    const f = folders.get(p)
    let extraSize = 0,
      extraFiles = 0,
      extraDirs = f.child_dirs.length
    for (const c of f.child_dirs) {
      const ch = folders.get(c)
      if (!ch) continue
      extraSize += ch.size
      extraFiles += ch.file_count
      extraDirs += ch.dir_count
      for (const [k, v] of ch.types) f.types.set(k, (f.types.get(k) || 0) + v)
    }
    f.size += extraSize
    f.file_count += extraFiles
    f.dir_count = extraDirs
  }

  large.sort((a, b) => b.size - a.size)
  large.length = Math.min(400, large.length)
  recent.sort((a, b) => b.mtime - a.mtime)
  recent.length = Math.min(60, recent.length)
  for (const [k, v] of [...sizeIndex.entries()]) {
    if (v.length < 2) sizeIndex.delete(k)
  }

  const rootF = folders.get(root)
  const scanned_bytes = rootF?.size ?? bytes
  const live = listDrives().find((d) => d.mount === drive.mount) || drive
  const inaccessible_bytes = Math.max(0, live.used - scanned_bytes)

  const scan = {
    drive: live,
    scanned_at: Math.floor(Date.now() / 1000),
    scanned_bytes,
    file_count: rootF?.file_count ?? files,
    dir_count: rootF?.dir_count ?? dirs,
    inaccessible_count: inaccessible,
    categories,
    file_types: fileTypes,
    folders,
    large_files: large,
    recent_files: recent,
    size_index: sizeIndex,
  }
  state.scans.set(live.mount, scan)
  const summary = buildSummary(scan, inaccessible_bytes)
  setProgress({
    drive: live.mount,
    status: "done",
    files_scanned: scan.file_count,
    dirs_scanned: scan.dir_count,
    bytes_scanned: scanned_bytes,
    percent: 100,
    current_path: "",
    message: "Scan abgeschlossen.",
  })
  emit("scan-complete", summary)
  return summary
}

function buildSummary(scan, inaccessible_bytes) {
  const used = Math.max(scan.drive.used, scan.scanned_bytes + inaccessible_bytes, 1)
  const dashboardMap = new Map([
    ["programme", { key: "programme", label: "Programme", bytes: 0, percent: 0, color: "#8b7cff" }],
    ["spiele", { key: "spiele", label: "Spiele", bytes: 0, percent: 0, color: "#f472b6" }],
    ["dokumente", { key: "dokumente", label: "Dokumente", bytes: 0, percent: 0, color: "#7dd3fc" }],
    ["media", { key: "media", label: "Bilder & Videos", bytes: 0, percent: 0, color: "#fde68a" }],
    ["sonstiges", { key: "sonstiges", label: "Sonstiges", bytes: 0, percent: 0, color: "#fdba74" }],
  ])
  for (const [key, bytes] of scan.categories) {
    const [k, label, color] = dashboardOf(key)
    const cur = dashboardMap.get(k) || { key: k, label, bytes: 0, percent: 0, color }
    cur.bytes += bytes
    dashboardMap.set(k, cur)
  }
  if (inaccessible_bytes > 0) {
    dashboardMap.get("sonstiges").bytes += inaccessible_bytes
  }
  for (const v of dashboardMap.values()) v.percent = (v.bytes / used) * 100
  const dashboard = ["programme", "spiele", "dokumente", "media", "sonstiges"].map((k) => dashboardMap.get(k))

  const detailedMap = new Map()
  for (const [key, bytes] of scan.categories) {
    const [k, label, color] = detailedOf(key)
    const cur = detailedMap.get(k) || { key: k, label, bytes: 0, percent: 0, color }
    cur.bytes += bytes
    detailedMap.set(k, cur)
  }
  if (inaccessible_bytes > 0) {
    detailedMap.set("inaccessible", {
      key: "inaccessible",
      label: "Nicht zugänglich",
      bytes: inaccessible_bytes,
      percent: (inaccessible_bytes / used) * 100,
      color: "#64748b",
    })
  }
  for (const v of detailedMap.values()) v.percent = (v.bytes / used) * 100
  const detOrder = [
    "windows",
    "programs",
    "games",
    "engines",
    "userfiles",
    "downloads",
    "appdata",
    "temp",
    "other",
    "inaccessible",
  ]
  const detailed = detOrder.map((k) => detailedMap.get(k)).filter(Boolean)

  const file_types = ["image", "video", "document", "music", "archive", "other"].map((k) => {
    const bytes = scan.file_types.get(k) || 0
    return {
      key: k,
      label: KIND_LABEL[k],
      bytes: k === "other" ? bytes + inaccessible_bytes : bytes,
      percent: ((k === "other" ? bytes + inaccessible_bytes : bytes) / used) * 100,
      color: KIND_COLOR[k],
    }
  })

  return {
    drive: scan.drive,
    scanned_at: scan.scanned_at,
    scanned_bytes: scan.scanned_bytes,
    file_count: scan.file_count,
    dir_count: scan.dir_count,
    inaccessible_bytes,
    inaccessible_count: scan.inaccessible_count,
    dashboard,
    detailed,
    file_types,
    recent_files: scan.recent_files,
    large_files: scan.large_files,
  }
}

function typesOf(folder) {
  const total = folder.size || 1
  return [...folder.types.entries()]
    .map(([k, bytes]) => ({
      key: k,
      label: KIND_LABEL[k] || k,
      bytes,
      percent: (bytes / total) * 100,
      color: KIND_COLOR[k] || "#94a3b8",
    }))
    .sort((a, b) => b.bytes - a.bytes)
}

export async function handle(cmd, args) {
  switch (cmd) {
    case "get_user_profile":
      return userProfile()
    case "list_drives":
      return listDrives()
    case "get_scan_progress":
      return state.progress
    case "cancel_scan":
      state.cancel = true
      return null
    case "start_scan": {
      const drive = listDrives().find((d) => d.mount === args.mount)
      if (!drive) throw new Error("Laufwerk nicht gefunden.")
      if (state.scanning) return null
      state.scanning = true
      state.cancel = false
      setImmediate(() => {
        walkScan(drive)
          .catch((e) => {
            setProgress({ status: "error", message: e.message || String(e) })
          })
          .finally(() => {
            state.scanning = false
          })
      })
      return null
    }
    case "get_scan_summary": {
      const scan = state.scans.get(args.mount)
      if (!scan) return null
      const live = listDrives().find((d) => d.mount === args.mount)
      if (live) scan.drive = live
      return buildSummary(scan, Math.max(0, scan.drive.used - scan.scanned_bytes))
    }
    case "list_folder": {
      return listFolder(state.scans.get(args.mount) || null, args.path)
    }
    case "get_large_files":
      return state.scans.get(args.mount)?.large_files ?? []
    case "get_recent_files":
      return state.scans.get(args.mount)?.recent_files ?? []
    case "find_duplicates": {
      const scan = state.scans.get(args.mount)
      if (!scan) throw new Error("Bitte zuerst das Laufwerk scannen.")
      return findDuplicates(scan)
    }
    case "list_temp":
      return listTemp(args.mount)
    case "list_downloads":
      return listDownloads()
    case "list_trash":
      return listTrash()
    case "open_path":
      openNative(args.path)
      return { ok: true, message: "Geöffnet.", freed: 0 }
    case "reveal_path":
      openNative(path.dirname(args.path))
      return { ok: true, message: "Speicherort angezeigt.", freed: 0 }
    case "delete_paths":
      return deletePaths(args.paths || [], args.to_trash !== false)
    case "empty_trash": {
      const items = listTrash()
      return deletePaths(
        items.map((i) => i.path),
        false,
      )
    }
    default:
      throw new Error(`Unbekannt: ${cmd}`)
  }
}

function listFolder(scan, dirPath) {
  const used = scan?.drive?.used || 1
  const cached = scan?.folders?.get(dirPath)
  let entries = []
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return {
      name: path.basename(dirPath),
      path: dirPath,
      size: cached?.size ?? null,
      file_count: cached?.file_count ?? null,
      dir_count: cached?.dir_count ?? null,
      mtime: cached?.mtime ?? null,
      percent: cached ? (cached.size / used) * 100 : 0,
      types: [],
      children: [],
      inaccessible: true,
      note: "Zugriff verweigert",
    }
  }
  const children = []
  for (const ent of entries) {
    const full = path.join(dirPath, ent.name)
    if (ent.isDirectory()) {
      const st = scan?.folders?.get(full)
      children.push({
        name: ent.name,
        path: full,
        is_dir: true,
        size: st?.size ?? null,
        file_count: st?.file_count ?? null,
        dir_count: st?.dir_count ?? null,
        mtime: st?.mtime ?? null,
        percent: st ? (st.size / used) * 100 : 0,
        types: st ? typesOf(st) : [],
        inaccessible: scan ? !st : false,
        note: st ? null : "Größe nach Scan verfügbar",
      })
    } else if (ent.isFile()) {
      let st
      try {
        st = fs.statSync(full)
      } catch {
        children.push({
          name: ent.name,
          path: full,
          is_dir: false,
          size: null,
          file_count: null,
          dir_count: null,
          mtime: null,
          percent: 0,
          types: [],
          inaccessible: true,
          note: "Zugriff verweigert",
        })
        continue
      }
      const ext = fileExt(ent.name)
      const kind = fileKind(ext)
      children.push({
        name: ent.name,
        path: full,
        is_dir: false,
        size: st.size,
        file_count: null,
        dir_count: null,
        mtime: Math.floor(st.mtimeMs / 1000),
        percent: (st.size / used) * 100,
        types: [
          {
            key: kind,
            label: KIND_LABEL[kind],
            bytes: st.size,
            percent: 100,
            color: KIND_COLOR[kind],
          },
        ],
        inaccessible: false,
        note: null,
      })
    }
  }
  children.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return (b.size ?? -1) - (a.size ?? -1)
  })
  return {
    name: cached?.name || path.basename(dirPath) || dirPath,
    path: dirPath,
    size: cached?.size ?? null,
    file_count: cached?.file_count ?? null,
    dir_count: cached?.dir_count ?? null,
    mtime: cached?.mtime ?? null,
    percent: cached ? (cached.size / used) * 100 : 0,
    types: cached ? typesOf(cached) : [],
    children,
    inaccessible: false,
    note: null,
  }
}

function hashFile(filePath) {
  const buf = fs.readFileSync(filePath)
  return crypto.createHash("sha256").update(buf).digest("hex")
}

function quickHash(filePath) {
  const fd = fs.openSync(filePath, "r")
  try {
    const st = fs.fstatSync(fd)
    const n = Math.min(65536, st.size)
    const start = Buffer.alloc(n)
    fs.readSync(fd, start, 0, n, 0)
    const h = crypto.createHash("sha256")
    h.update(start)
    if (st.size > 65536) {
      const end = Buffer.alloc(n)
      fs.readSync(fd, end, 0, n, st.size - n)
      h.update(end)
    }
    h.update(Buffer.from(String(st.size)))
    return h.digest("hex")
  } finally {
    fs.closeSync(fd)
  }
}

function findDuplicates(scan) {
  const quick = new Map()
  for (const [size, paths] of scan.size_index) {
    if (paths.length < 2) continue
    for (const p of paths) {
      try {
        const q = `${size}:${quickHash(p)}`
        const arr = quick.get(q) || []
        arr.push(p)
        quick.set(q, arr)
      } catch {
        /* skip */
      }
    }
  }
  const groups = []
  for (const [, paths] of quick) {
    if (paths.length < 2) continue
    const full = new Map()
    for (const p of paths) {
      try {
        const h = hashFile(p)
        const arr = full.get(h) || []
        arr.push(p)
        full.set(h, arr)
      } catch {
        /* skip */
      }
    }
    for (const [hash, files] of full) {
      if (files.length < 2) continue
      const entries = files.map((p) => fileEntry(p))
      const size = entries[0]?.size || 0
      groups.push({
        hash,
        size,
        files: entries,
        wasted: size * (entries.length - 1),
      })
    }
  }
  groups.sort((a, b) => b.wasted - a.wasted)
  return {
    groups,
    wasted: groups.reduce((a, g) => a + g.wasted, 0),
    file_count: groups.reduce((a, g) => a + g.files.length, 0),
    status: "ok",
  }
}

function fileEntry(p) {
  const name = path.basename(p)
  const ext = fileExt(name)
  let st
  try {
    st = fs.statSync(p)
  } catch {
    return { name, path: p, size: 0, mtime: 0, ext, kind: fileKind(ext), inaccessible: true }
  }
  return {
    name,
    path: p,
    size: st.size,
    mtime: Math.floor(st.mtimeMs / 1000),
    ext,
    kind: fileKind(ext),
    inaccessible: false,
  }
}

function summarizeDir(dir, depth = 6, samples = 12) {
  let bytes = 0
  let count = 0
  const sample = []
  const stack = [{ p: dir, d: 0 }]
  while (stack.length) {
    const { p, d } = stack.pop()
    let ents
    try {
      ents = fs.readdirSync(p, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of ents) {
      const full = path.join(p, e.name)
      if (e.isDirectory() && d < depth) stack.push({ p: full, d: d + 1 })
      else if (e.isFile()) {
        try {
          const st = fs.statSync(full)
          bytes += st.size
          count += 1
          if (sample.length < samples) sample.push(fileEntry(full))
        } catch {
          /* skip */
        }
      }
    }
  }
  return { bytes, count, sample }
}

function listTemp() {
  const home = os.homedir()
  const cats = []
  const add = (key, label, dir, cautious, description) => {
    if (!fs.existsSync(dir)) return
    const { bytes, count, sample } = summarizeDir(dir)
    if (!count && !bytes) return
    cats.push({
      key,
      label,
      bytes,
      file_count: count,
      cautious,
      description,
      samples: sample,
    })
  }
  add("user-temp", "Benutzer-Temp", os.tmpdir(), false, "Temporäre Dateien des Benutzerkontos.")
  if (process.platform !== "win32") {
    add("var-tmp", "/var/tmp", "/var/tmp", false, "Systemweite temporäre Dateien.")
    add("user-cache", "Benutzer-Cache", path.join(home, ".cache"), false, "Anwendungs-Caches.")
    add("thumb", "Miniaturansichten", path.join(home, ".cache/thumbnails"), false, "Vorschaubilder.")
  }
  const total_bytes = cats.reduce((a, c) => a + c.bytes, 0)
  const total_files = cats.reduce((a, c) => a + c.file_count, 0)
  return { categories: cats, total_bytes, total_files }
}

function listDownloads() {
  const home = os.homedir()
  const dirs = [path.join(home, "Downloads"), path.join(home, "downloads")]
  const files = []
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue
    try {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isFile()) continue
        files.push(fileEntry(path.join(d, e.name)))
      }
    } catch {
      /* skip */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime)
  return files
}

function listTrash() {
  const home = os.homedir()
  const roots = [path.join(home, ".local/share/Trash/files"), path.join(home, ".Trash")]
  const items = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    try {
      for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        const full = path.join(root, e.name)
        let size = 0
        try {
          const st = fs.statSync(full)
          size = st.isFile() ? st.size : 0
        } catch {
          /* skip */
        }
        items.push({ name: e.name, path: full, size, is_dir: e.isDirectory() })
      }
    } catch {
      /* skip */
    }
  }
  return items
}

function isProtected(p) {
  const s = norm(p)
  return ["/windows/system32", "/windows/winsxs", "/usr/bin", "/usr/sbin", "/bin/", "/sbin/"].some((n) => s.includes(n))
}

function deletePaths(paths, toTrash) {
  let freed = 0
  const errors = []
  for (const p of paths) {
    if (isProtected(p)) {
      errors.push(`Geschützt: ${p}`)
      continue
    }
    try {
      const st = fs.lstatSync(p)
      const sz = st.isFile() ? st.size : 0
      if (toTrash) {
        const trashDir = path.join(os.homedir(), ".local/share/Trash/files")
        fs.mkdirSync(trashDir, { recursive: true })
        fs.renameSync(p, path.join(trashDir, path.basename(p)))
      } else if (st.isDirectory()) fs.rmSync(p, { recursive: true, force: true })
      else fs.unlinkSync(p)
      freed += sz
    } catch (e) {
      errors.push(`${p}: ${e.message}`)
    }
  }
  if (errors.length && !freed) throw new Error(errors.join(" · "))
  return { ok: true, message: errors.length ? errors.join(" · ") : "Entfernt.", freed }
}

function openNative(p) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"
  try {
    execSync(`${cmd} ${JSON.stringify(p)}`, { stdio: "ignore" })
  } catch {
    /* ignore in preview */
  }
}
