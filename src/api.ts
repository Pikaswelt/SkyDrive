import type {
  ActionResult,
  DriveInfo,
  DuplicateReport,
  FileEntry,
  FolderDetail,
  ScanProgress,
  ScanSummary,
  TempReport,
  TrashItem,
  UserProfile,
} from "./types"

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<T>(cmd, args)
}

async function httpInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/__api/${cmd}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function api<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) return tauriInvoke<T>(cmd, args)
  return httpInvoke<T>(cmd, args)
}

export const getUserProfile = () => api<UserProfile>("get_user_profile")
export const listDrives = () => api<DriveInfo[]>("list_drives")
export const getScanProgress = () => api<ScanProgress>("get_scan_progress")
export const cancelScan = () => api<void>("cancel_scan")
export const startScan = (mount: string) => api<void>("start_scan", { mount })
export const getScanSummary = (mount: string) => api<ScanSummary | null>("get_scan_summary", { mount })
export const listFolder = (mount: string, path: string) =>
  api<FolderDetail>("list_folder", { mount, path })
export const getLargeFiles = (mount: string) => api<FileEntry[]>("get_large_files", { mount })
export const getRecentFiles = (mount: string) => api<FileEntry[]>("get_recent_files", { mount })
export const findDuplicates = (mount: string) => api<DuplicateReport>("find_duplicates", { mount })
export const listTemp = (mount: string) => api<TempReport>("list_temp", { mount })
export const listDownloads = (mount: string) => api<FileEntry[]>("list_downloads", { mount })
export const listTrash = () => api<TrashItem[]>("list_trash")
export const openPath = (path: string) => api<ActionResult>("open_path", { path })
export const revealPath = (path: string) => api<ActionResult>("reveal_path", { path })
export const deletePaths = (paths: string[], toTrash = true) =>
  api<ActionResult>("delete_paths", { paths, to_trash: toTrash })
export const emptyTrash = () => api<ActionResult>("empty_trash")

export async function onScanProgress(cb: (p: ScanProgress) => void): Promise<() => void> {
  if (isTauri()) {
    const { listen } = await import("@tauri-apps/api/event")
    const un = await listen<ScanProgress>("scan-progress", (e) => cb(e.payload))
    return () => {
      un()
    }
  }
  const es = new EventSource("/__api/events")
  const handler = (e: MessageEvent) => {
    try {
      cb(JSON.parse(e.data) as ScanProgress)
    } catch {
      /* ignore */
    }
  }
  es.addEventListener("scan-progress", handler as EventListener)
  return () => es.close()
}

export async function onScanComplete(cb: (s: ScanSummary) => void): Promise<() => void> {
  if (isTauri()) {
    const { listen } = await import("@tauri-apps/api/event")
    const un = await listen<ScanSummary>("scan-complete", (e) => cb(e.payload))
    return () => {
      un()
    }
  }
  const es = new EventSource("/__api/events")
  const handler = (e: MessageEvent) => {
    try {
      cb(JSON.parse(e.data) as ScanSummary)
    } catch {
      /* ignore */
    }
  }
  es.addEventListener("scan-complete", handler as EventListener)
  return () => es.close()
}

export async function windowAction(kind: "minimize" | "toggleMaximize" | "close") {
  if (!isTauri()) return
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  const w = getCurrentWindow()
  if (kind === "minimize") await w.minimize()
  if (kind === "toggleMaximize") await w.toggleMaximize()
  if (kind === "close") await w.close()
}
