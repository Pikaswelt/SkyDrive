import {
  ChevronRight,
  Copy,
  FileStack,
  HardDrive,
  Image as ImageIcon,
  MoreVertical,
  Music,
  Archive,
  FileText,
  Film,
  Check,
  Trash2,
  Eraser,
} from "lucide-react"
import { Donut, KindIcon } from "./components"
import { driveLetter, formatBytes, formatPercent, relativeDate, usageRatio } from "./format"
import { openPath, revealPath } from "./api"
import type { DriveInfo, FileEntry, NamedSize, Page, ScanSummary } from "./types"
import { useState } from "react"

export function Dashboard({
  summary,
  drives,
  selected,
  onSelectDrive,
  setPage,
  onEmptyTrash,
  loading,
  error,
}: {
  summary: ScanSummary | null
  drives: DriveInfo[]
  selected: DriveInfo | null
  onSelectDrive: (d: DriveInfo) => void
  setPage: (p: Page) => void
  onEmptyTrash: () => void
  loading: boolean
  error: string | null
}) {
  const drive = summary?.drive ?? selected
  const used = drive?.used ?? 0
  const total = drive?.total ?? 0
  const pct = usageRatio(used, total)
  const letter = drive ? driveLetter(drive.mount) : "C:"
  const slices = summary?.dashboard ?? []

  return (
    <div className="dash">
      <section className="card">
        <h3>Speicherplatz ({letter})</h3>
        {error ? (
          <div className="error">
            <h4>Scan fehlgeschlagen</h4>
            <p>{error}</p>
          </div>
        ) : loading && !summary ? (
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <div className="skel" />
            <div className="skel" />
            <div className="skel" />
          </div>
        ) : (
          <>
            <div className="usage-line">
              <span>
                {formatBytes(used, 0)} von {formatBytes(total, 0)} verwendet
              </span>
              <b>{formatPercent(pct)}</b>
            </div>
            <div className="bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="storage-body">
              <div className="legend">
                {slices.map((s) => (
                  <div className="legend-row" key={s.key}>
                    <i className="dot" style={{ background: s.color, color: s.color }} />
                    <span>{s.label}</span>
                    <span className="sz">{formatBytes(s.bytes, 0)}</span>
                    <span className="pc">{formatPercent(s.percent)}</span>
                  </div>
                ))}
              </div>
              <Donut slices={slices} center={formatBytes(used, 0)} sub="verwendet" />
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>Schnellzugriff</h3>
        <div className="quick-grid">
          <button className="quick" onClick={() => setPage("temp")}>
            <Eraser size={22} />
            Temporäre Dateien löschen
          </button>
          <button className="quick" onClick={() => setPage("duplicates")}>
            <Copy size={22} />
            Duplikate finden
          </button>
          <button className="quick" onClick={() => setPage("large")}>
            <FileStack size={22} />
            Große Dateien anzeigen
          </button>
          <button className="quick" onClick={onEmptyTrash}>
            <Trash2 size={22} />
            Papierkorb leeren
          </button>
        </div>
      </section>

      <div className="mid">
        <section className="card">
          <h3>Speicherorte</h3>
          <div style={{ marginTop: 8 }}>
            {drives.length === 0 && loading ? (
              <div className="skel" />
            ) : (
              drives.map((d) => (
                <div className="drive-row" key={d.id} onClick={() => onSelectDrive(d)}>
                  <div className="drive-ico">
                    <HardDrive size={16} />
                  </div>
                  <div className="grow">
                    <div className="t">{d.name}</div>
                    <div className="mini-bar">
                      <i style={{ width: `${usageRatio(d.used, d.total)}%` }} />
                    </div>
                    <div className="s">
                      {formatBytes(d.used, 0)} / {formatBytes(d.total, 0)}
                      {d.fs ? ` · ${d.fs}` : ""}
                    </div>
                  </div>
                  <ChevronRight className="chev" size={16} />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card">
          <h3>Speicher nach Dateityp</h3>
          <div style={{ marginTop: 6 }}>
            {(summary?.file_types ?? placeholderTypes()).map((t) => (
              <TypeRow key={t.key} item={t} />
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Letzte Dateien</h3>
            <button className="link" onClick={() => setPage("files")}>
              Alle anzeigen
            </button>
          </div>
          {(summary?.recent_files ?? []).slice(0, 5).map((f) => (
            <RecentRow key={f.path} file={f} />
          ))}
          {summary && summary.recent_files.length === 0 && (
            <div className="empty">Keine kürzlich geänderten Dateien gefunden.</div>
          )}
          {!summary && <div className="empty">Wird nach dem Scan angezeigt.</div>}
        </section>
      </div>

      <div className="bottom">
        <section className="card upgrade">
          <img src="/upgrade-girl.png" alt="" />
          <div>
            <h4>Mehr Platz für deine Welten.</h4>
            <p>Räume Caches, Duplikate und große Archive auf – und behalte jede Datei im Blick.</p>
          </div>
          <button className="pill" onClick={() => setPage("temp")}>
            Jetzt upgraden →
          </button>
        </section>
        <section className="card status">
          <img src="/neko-mascot.png" alt="" />
          <div className="k">Systemstatus</div>
          <div className="v">
            Alles läuft reibungslos!
            <span className="ok-dot">
              <Check size={11} />
            </span>
          </div>
        </section>
      </div>
      <div className="hand">Keep ♡ your files safe ♡</div>
    </div>
  )
}

function TypeRow({ item }: { item: NamedSize }) {
  const icons: Record<string, typeof ImageIcon> = {
    image: ImageIcon,
    video: Film,
    document: FileText,
    music: Music,
    archive: Archive,
    other: FileStack,
  }
  const Icon = icons[item.key] ?? FileStack
  return (
    <div className="type-row">
      <div className="type-ico" style={{ background: item.color }}>
        <Icon size={15} color="#0b1020" />
      </div>
      <div className="grow">
        <div className="t">{item.label}</div>
      </div>
      <div className="right">
        <b>{formatBytes(item.bytes, 0)}</b>
        <span>{formatPercent(item.percent)}</span>
      </div>
    </div>
  )
}

function RecentRow({ file }: { file: FileEntry }) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="file-row" onDoubleClick={() => openPath(file.path)}>
      <div className="thumb">
        <KindIcon kind={file.kind} />
      </div>
      <div className="grow">
        <div className="t">{file.name}</div>
      </div>
      <div className="meta">
        <span>{relativeDate(file.mtime)}</span>
        <span>{formatBytes(file.size)}</span>
      </div>
      <button className="kebab" onClick={() => setMenu((v) => !v)}>
        <MoreVertical size={16} />
      </button>
      {menu && (
        <div className="menu" style={{ right: 16 }}>
          <button onClick={() => openPath(file.path)}>Öffnen</button>
          <button onClick={() => revealPath(file.path)}>Ordner anzeigen</button>
        </div>
      )}
    </div>
  )
}

function placeholderTypes(): NamedSize[] {
  const keys = [
    ["image", "Bilder", "#2dd4bf"],
    ["video", "Videos", "#fb7185"],
    ["document", "Dokumente", "#60a5fa"],
    ["music", "Musik", "#c084fc"],
    ["archive", "Archive", "#d97706"],
    ["other", "Sonstiges", "#94a3b8"],
  ] as const
  return keys.map(([key, label, color]) => ({ key, label, bytes: 0, percent: 0, color }))
}
