import {
  Copy,
  Download,
  FileStack,
  Folder,
  HardDrive,
  LayoutDashboard,
  Minus,
  RefreshCw,
  Settings,
  Square,
  Trash2,
  X,
} from "lucide-react"
import type { NamedSize, Page, ScanProgress, UserProfile } from "./types"

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M10 20.5c-3.2 0-5.5-2.2-5.5-5.1 0-2.4 1.6-4.5 3.9-5.2C9 7.4 11.6 5.5 15 5.5c3.8 0 6.5 2.4 7.2 5.7 3 .3 5.3 2.6 5.3 5.5 0 3.1-2.6 5.8-6.2 5.8H10z"
        stroke="white"
        strokeWidth="1.7"
        fill="rgba(255,255,255,0.06)"
      />
      <path d="M16 13.2v8.2M16 21.4l-2.3-2.3M16 21.4l2.3-2.3" stroke="#9ad7ff" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function TitleBar({ onSettings, onRescan, scanning }: { onSettings: () => void; onRescan: () => void; scanning: boolean }) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <button className="icon-btn" title="Erneut scannen" onClick={onRescan} disabled={scanning}>
        <RefreshCw size={16} />
      </button>
      <button className="icon-btn" title="Einstellungen" onClick={onSettings}>
        <Settings size={16} />
      </button>
      <div className="win-controls">
        <button className="win-btn" onClick={() => import("./api").then((m) => m.windowAction("minimize"))}>
          <Minus size={14} />
        </button>
        <button className="win-btn" onClick={() => import("./api").then((m) => m.windowAction("toggleMaximize"))}>
          <Square size={11} />
        </button>
        <button className="win-btn close" onClick={() => import("./api").then((m) => m.windowAction("close"))}>
          <X size={14} />
        </button>
      </div>
    </header>
  )
}

const NAV: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard },
  { id: "storage", label: "Speicher", icon: HardDrive },
  { id: "files", label: "Dateien", icon: Folder },
  { id: "duplicates", label: "Duplikate", icon: Copy },
  { id: "large", label: "Große Dateien", icon: FileStack },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "trash", label: "Papierkorb", icon: Trash2 },
]

export function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void; profile: UserProfile | null }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        SkyDrive
      </div>
      <nav className="nav">
        {NAV.map((n) => {
          const Icon = n.icon
          return (
            <button key={n.id} className={`nav-item${page === n.id ? " active" : ""}`} onClick={() => setPage(n.id)}>
              <Icon size={18} />
              {n.label}
            </button>
          )
        })}
      </nav>
      <div className="side-foot">
        <img className="avatar" src="/avatar.png" alt="" />
        <p>
          Mehr Speicher.
          <br />
          Mehr Freiheit.
        </p>
      </div>
    </aside>
  )
}

export function ScanStrip({ progress, onCancel }: { progress: ScanProgress; onCancel: () => void }) {
  if (progress.status !== "scanning" && progress.status !== "aggregating") return null
  return (
    <div className="scan-strip">
      <div>
        <div className="meta">
          <strong>{progress.message}</strong>
          {" · "}
          {progress.files_scanned.toLocaleString("de-DE")} Dateien · {progress.dirs_scanned.toLocaleString("de-DE")} Ordner
        </div>
        <div className="scan-path">{progress.current_path}</div>
        <div className="bar" style={{ marginTop: 8 }}>
          <i style={{ width: `${Math.max(4, progress.percent)}%` }} />
        </div>
      </div>
      <button className="ghost" onClick={onCancel}>
        Abbrechen
      </button>
    </div>
  )
}

export function Donut({ slices, center, sub }: { slices: NamedSize[]; center: string; sub: string }) {
  const r = 54
  const c = 2 * Math.PI * r
  const total = slices.reduce((a, s) => a + s.bytes, 0) || 1
  let offset = 0
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="16" />
        {slices
          .filter((s) => s.bytes > 0)
          .map((s) => {
            const len = (s.bytes / total) * c
            const el = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += len
            return el
          })}
      </svg>
      <div className="donut-center">
        <strong>{center}</strong>
        <span>{sub}</span>
      </div>
    </div>
  )
}

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="row">
          <button className="btn secondary" onClick={onCancel}>
            Abbrechen
          </button>
          <button className={`btn${danger ? " danger" : ""}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function KindIcon({ kind }: { kind: string }) {
  const map: Record<string, string> = {
    image: "#2dd4bf",
    video: "#fb7185",
    document: "#60a5fa",
    music: "#c084fc",
    archive: "#d97706",
    other: "#94a3b8",
  }
  return <span className="type-ico" style={{ background: map[kind] ?? "#94a3b8" }} />
}
