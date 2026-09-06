import { useEffect, useMemo, useState } from "react"
import { Folder, File, ChevronRight } from "lucide-react"
import { listFolder, openPath, revealPath } from "./api"
import { formatBytes, formatDateTime, formatPercent } from "./format"
import type { DriveInfo, FolderDetail, ScanSummary } from "./types"

export function StoragePage({
  drive,
  summary,
}: {
  drive: DriveInfo | null
  summary: ScanSummary | null
}) {
  const root = drive?.mount ?? ""
  const [path, setPath] = useState(root)
  const [detail, setDetail] = useState<FolderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sort, setSort] = useState<"size" | "name" | "mtime">("size")

  useEffect(() => {
    setPath(root)
  }, [root])

  useEffect(() => {
    if (!drive || !path) return
    let live = true
    setBusy(true)
    listFolder(drive.mount, path)
      .then((d) => {
        if (live) {
          setDetail(d)
          setError(null)
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message)
      })
      .finally(() => {
        if (live) setBusy(false)
      })
    return () => {
      live = false
    }
  }, [drive, path, summary?.scanned_at])

  const crumbs = useMemo(() => crumbsFor(root, path), [root, path])
  const children = useMemo(() => {
    const list = [...(detail?.children ?? [])]
    list.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      if (sort === "name") return a.name.localeCompare(b.name, "de")
      if (sort === "mtime") return (b.mtime ?? 0) - (a.mtime ?? 0)
      return (b.size ?? -1) - (a.size ?? -1)
    })
    return list
  }, [detail, sort])

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2>Speicher</h2>
          <div className="sub">Laufwerk → Ordner → Dateien. Jede Zahl stammt aus dem letzten Scan.</div>
        </div>
        <select className="search" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="size">Sortierung: Größe</option>
          <option value="name">Sortierung: Name</option>
          <option value="mtime">Sortierung: Datum</option>
        </select>
      </div>

      {summary && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h3>Aufschlüsselung von {formatBytes(summary.drive.used, 0)} belegt</h3>
          <div className="legend" style={{ marginTop: 12 }}>
            {summary.detailed.map((s) => (
              <div className="legend-row" key={s.key}>
                <i className="dot" style={{ background: s.color, color: s.color }} />
                <span>{s.label}</span>
                <span className="sz">{s.bytes === 0 ? "—" : formatBytes(s.bytes)}</span>
                <span className="pc">{formatPercent(s.percent)}</span>
              </div>
            ))}
          </div>
          {summary.inaccessible_bytes > 0 && (
            <p className="note">
              {formatBytes(summary.inaccessible_bytes)} sind nicht zugänglich oder konnten nicht gelesen werden – keine Schätzwerte.
            </p>
          )}
        </section>
      )}

      <section className="card">
        <div className="crumbs">
          {crumbs.map((c, i) => (
            <span key={c.path} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <ChevronRight size={12} />}
              <button onClick={() => setPath(c.path)}>{c.label}</button>
            </span>
          ))}
        </div>

        {detail && (
          <div className="folder-stats">
            <Stat label="Größe" value={detail.size == null ? "Nicht zugänglich" : formatBytes(detail.size)} />
            <Stat label="Dateien" value={detail.file_count == null ? "—" : detail.file_count.toLocaleString("de-DE")} />
            <Stat label="Unterordner" value={detail.dir_count == null ? "—" : detail.dir_count.toLocaleString("de-DE")} />
            <Stat label="Anteil am Laufwerk" value={formatPercent(detail.percent)} />
            <Stat label="Geändert" value={formatDateTime(detail.mtime ?? 0)} />
          </div>
        )}

        {detail && detail.types.length > 0 && (
          <div className="legend" style={{ marginBottom: 12 }}>
            {detail.types.slice(0, 6).map((t) => (
              <div className="legend-row" key={t.key}>
                <i className="dot" style={{ background: t.color, color: t.color }} />
                <span>{t.label}</span>
                <span className="sz">{formatBytes(t.bytes)}</span>
                <span className="pc">{formatPercent(t.percent)}</span>
              </div>
            ))}
          </div>
        )}

        {error && <div className="error">{error}</div>}
        {busy && !detail && <div className="loading">Ordner wird gelesen …</div>}

        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Größe</th>
              <th>Dateien</th>
              <th>Ordner</th>
              <th>Anteil</th>
              <th>Geändert</th>
            </tr>
          </thead>
          <tbody>
            {children.map((c) => (
              <tr
                key={c.path}
                onClick={() => (c.is_dir ? setPath(c.path) : revealPath(c.path))}
                onDoubleClick={() => (c.is_dir ? setPath(c.path) : openPath(c.path))}
              >
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {c.is_dir ? <Folder size={14} /> : <File size={14} />}
                    {c.name}
                  </span>
                </td>
                <td className="muted">{fmtMaybe(c.size, c.inaccessible)}</td>
                <td className="muted">{c.file_count == null ? "—" : c.file_count.toLocaleString("de-DE")}</td>
                <td className="muted">{c.dir_count == null ? "—" : c.dir_count.toLocaleString("de-DE")}</td>
                <td className="muted">{formatPercent(c.percent)}</td>
                <td className="muted">{formatDateTime(c.mtime ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {children.length === 0 && !busy && <div className="empty">Dieser Ordner ist leer oder nicht lesbar.</div>}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="l">{label}</div>
      <div className="n">{value}</div>
    </div>
  )
}

function fmtMaybe(n: number | null, inaccessible: boolean) {
  if (inaccessible && n == null) return "Zugriff verweigert"
  if (n == null) return "—"
  return formatBytes(n)
}

function crumbsFor(root: string, path: string) {
  const items = [{ label: root || "/", path: root || "/" }]
  const rest = path.slice(root.length).replace(/^[/\\]+/, "")
  if (!rest) return items
  let acc = root.endsWith("/") || root.endsWith("\\") ? root.slice(0, -1) : root
  const sep = root.includes("\\") ? "\\" : "/"
  for (const part of rest.split(/[/\\]/).filter(Boolean)) {
    acc = acc.endsWith(":") ? acc + sep + part : acc + sep + part
    items.push({ label: part, path: acc })
  }
  return items
}
