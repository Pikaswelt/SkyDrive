import { useEffect, useMemo, useState } from "react"
import { formatBytes, formatDateTime, relativeDate } from "./format"
import {
  deletePaths,
  emptyTrash,
  findDuplicates,
  listDownloads,
  listTemp,
  listTrash,
  openPath,
  revealPath,
} from "./api"
import type { DriveInfo, DuplicateReport, FileEntry, ScanSummary, TempReport, TrashItem } from "./types"
import { ConfirmModal } from "./components"

export function FilesPage({ summary }: { summary: ScanSummary | null }) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<"mtime" | "size" | "name">("mtime")
  const files = useMemo(() => {
    const list = [...(summary?.recent_files ?? []), ...(summary?.large_files ?? [])]
    const seen = new Set<string>()
    const uniq = list.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)))
    const filtered = q
      ? uniq.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()) || f.path.toLowerCase().includes(q.toLowerCase()))
      : uniq
    filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "de")
      if (sort === "size") return b.size - a.size
      return b.mtime - a.mtime
    })
    return filtered
  }, [summary, q, sort])

  return (
    <FileTable
      title="Dateien"
      sub="Zuletzt gesehene und große Dateien aus dem Scan. Doppelklick öffnet im System."
      files={files}
      query={q}
      setQuery={setQ}
      sort={sort}
      setSort={(v) => setSort(v as typeof sort)}
    />
  )
}

export function LargeFilesPage({ summary }: { summary: ScanSummary | null }) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<"size" | "name" | "mtime" | "kind">("size")
  const files = useMemo(() => {
    let list = [...(summary?.large_files ?? [])]
    if (q) {
      const s = q.toLowerCase()
      list = list.filter(
        (f) => f.name.toLowerCase().includes(s) || f.path.toLowerCase().includes(s) || f.ext.includes(s) || f.kind.includes(s),
      )
    }
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "de")
      if (sort === "mtime") return b.mtime - a.mtime
      if (sort === "kind") return a.kind.localeCompare(b.kind) || b.size - a.size
      return b.size - a.size
    })
    return list
  }, [summary, q, sort])

  return (
    <FileTable
      title="Große Dateien"
      sub="Echte Dateien, sortiert nach Größe. Klick zeigt den Speicherort."
      files={files}
      query={q}
      setQuery={setQ}
      sort={sort}
      setSort={(v) => setSort(v as typeof sort)}
      extraSort
    />
  )
}

export function DownloadsPage({ drive }: { drive: DriveInfo | null }) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!drive) return
    listDownloads(drive.mount)
      .then(setFiles)
      .catch((e: Error) => setErr(e.message))
  }, [drive])
  return (
    <FileTable
      title="Downloads"
      sub="Dateien im Downloads-Ordner – direkt aus dem Dateisystem."
      files={files}
      error={err}
    />
  )
}

function FileTable({
  title,
  sub,
  files,
  query,
  setQuery,
  sort,
  setSort,
  extraSort,
  error,
}: {
  title: string
  sub: string
  files: FileEntry[]
  query?: string
  setQuery?: (s: string) => void
  sort?: string
  setSort?: (s: string) => void
  extraSort?: boolean
  error?: string | null
}) {
  const [confirm, setConfirm] = useState<FileEntry | null>(null)
  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2>{title}</h2>
          <div className="sub">{sub}</div>
        </div>
        <div className="sorts">
          {setQuery && (
            <input className="search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
          {setSort && (
            <select className="search" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="size">Größe</option>
              <option value="name">Name</option>
              <option value="mtime">Datum</option>
              {extraSort && <option value="kind">Dateityp</option>}
            </select>
          )}
        </div>
      </div>
      <section className="card">
        {error && <div className="error">{error}</div>}
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Größe</th>
              <th>Geändert</th>
              <th>Speicherort</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.path} onClick={() => revealPath(f.path)} onDoubleClick={() => openPath(f.path)}>
                <td>{f.name}</td>
                <td className="muted">{f.ext || f.kind}</td>
                <td>{formatBytes(f.size)}</td>
                <td className="muted">{relativeDate(f.mtime)}</td>
                <td className="path" title={f.path}>
                  {f.path}
                </td>
                <td>
                  <button className="link" onClick={(e) => (e.stopPropagation(), setConfirm(f))}>
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 && <div className="empty">Keine Dateien gefunden.</div>}
      </section>
      {confirm && (
        <ConfirmModal
          title="Datei in den Papierkorb?"
          body={`${confirm.name} (${formatBytes(confirm.size)}) wird nicht sofort endgültig gelöscht.`}
          confirmLabel="In den Papierkorb"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await deletePaths([confirm.path], true)
            setConfirm(null)
          }}
        />
      )}
    </div>
  )
}

export function DuplicatesPage({ drive }: { drive: DriveInfo | null }) {
  const [report, setReport] = useState<DuplicateReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [confirm, setConfirm] = useState(false)

  const run = async () => {
    if (!drive) return
    setBusy(true)
    setErr(null)
    try {
      setReport(await findDuplicates(drive.mount))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const chosen = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k)

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2>Duplikate</h2>
          <div className="sub">Zuerst Größe, dann Hash. Es wird nie automatisch gelöscht.</div>
        </div>
        <div className="sorts">
          <button className="btn" onClick={run} disabled={busy}>
            {busy ? "Vergleiche …" : "Duplikate scannen"}
          </button>
          <button className="btn danger" disabled={!chosen.length} onClick={() => setConfirm(true)}>
            Ausgewählte entfernen
          </button>
        </div>
      </div>
      <section className="card">
        {err && <div className="error">{err}</div>}
        {busy && <div className="loading">Dateiinhalte werden gehasht. Die Oberfläche bleibt bedienbar.</div>}
        {report && (
          <p className="note">
            {report.groups.length.toLocaleString("de-DE")} Gruppen · {formatBytes(report.wasted)} könnten durch Entfernen von Kopien frei werden.
          </p>
        )}
        {report?.groups.map((g) => (
          <div className="dup-group" key={g.hash}>
            <div className="dup-head">
              <strong>
                {g.files.length} identische Dateien · {formatBytes(g.size)}
              </strong>
              <span>Freigabe möglich: {formatBytes(g.wasted)}</span>
            </div>
            <div className="checks">
              {g.files.map((f, i) => (
                <label key={f.path}>
                  <input
                    type="checkbox"
                    checked={!!selected[f.path]}
                    disabled={i === 0 && !selected[f.path] && g.files.every((x, idx) => idx === 0 || !selected[x.path])}
                    onChange={(e) => setSelected((s) => ({ ...s, [f.path]: e.target.checked }))}
                  />
                  <span>
                    {f.name}
                    <div className="s">{f.path}</div>
                  </span>
                  <span>{formatDateTime(f.mtime)}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {report && report.groups.length === 0 && <div className="empty">Keine Duplikate gefunden.</div>}
      </section>
      {confirm && (
        <ConfirmModal
          title={`${chosen.length} Duplikat(e) in den Papierkorb?`}
          body="Die Originale bleiben erhalten, sofern du sie nicht mit ausgewählt hast."
          confirmLabel="In den Papierkorb"
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            await deletePaths(chosen, true)
            setSelected({})
            setConfirm(false)
            await run()
          }}
        />
      )}
    </div>
  )
}

export function TempPage({ drive }: { drive: DriveInfo | null }) {
  const [report, setReport] = useState<TempReport | null>(null)
  const [confirm, setConfirm] = useState<string[] | null>(null)
  useEffect(() => {
    if (!drive) return
    listTemp(drive.mount).then(setReport).catch(() => setReport(null))
  }, [drive])

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2>Temporäre Dateien</h2>
          <div className="sub">Nur als löschbar markierte Bereiche. Systemverzeichnisse bleiben geschützt.</div>
        </div>
      </div>
      <section className="card">
        {report?.categories.map((c) => (
          <div key={c.key} className="dup-group">
            <div className="dup-head">
              <strong>{c.label}</strong>
              <span>
                {formatBytes(c.bytes)} · {c.file_count.toLocaleString("de-DE")} Dateien
              </span>
            </div>
            <p className="note">{c.description}</p>
            {c.cautious && <p className="warn">Vorsicht: nicht löschen, während Updates oder Installationen laufen.</p>}
            <div className="sorts" style={{ marginTop: 10 }}>
              <button
                className="btn secondary"
                disabled={c.cautious || c.samples.length === 0}
                onClick={() => setConfirm(c.samples.map((s) => s.path))}
              >
                Beispiele in den Papierkorb
              </button>
            </div>
          </div>
        ))}
        {report && (
          <p className="note">
            Potenziell freigebbar in den geprüften Ordnern: {formatBytes(report.total_bytes)}
          </p>
        )}
      </section>
      {confirm && (
        <ConfirmModal
          title="Temporäre Dateien entfernen?"
          body="Die ausgewählten Dateien werden in den Papierkorb gelegt, nicht endgültig gelöscht."
          confirmLabel="In den Papierkorb"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await deletePaths(confirm, true)
            setConfirm(null)
            if (drive) setReport(await listTemp(drive.mount))
          }}
        />
      )}
    </div>
  )
}

export function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([])
  const [confirm, setConfirm] = useState(false)
  const load = () => listTrash().then(setItems).catch(() => setItems([]))
  useEffect(() => {
    load()
  }, [])
  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2>Papierkorb</h2>
          <div className="sub">Leeren nur nach Bestätigung. Unter Windows kann der Inhalt eingeschränkt sichtbar sein.</div>
        </div>
        <button className="btn danger" onClick={() => setConfirm(true)} disabled={!items.length}>
          Papierkorb leeren
        </button>
      </div>
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Größe</th>
              <th>Pfad</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.path}>
                <td>
                  {i.name}
                  {i.is_dir ? " (Ordner)" : ""}
                </td>
                <td>{formatBytes(i.size)}</td>
                <td className="path">{i.path}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">Papierkorb ist leer oder nicht lesbar.</div>}
      </section>
      {confirm && (
        <ConfirmModal
          title="Papierkorb unwiderruflich leeren?"
          body="Diese Aktion löscht den Inhalt des Papierkorbs endgültig."
          confirmLabel="Endgültig löschen"
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            await emptyTrash()
            setConfirm(false)
            load()
          }}
        />
      )}
    </div>
  )
}

export function SettingsPage({ profileName }: { profileName: string }) {
  return (
    <div>
      <div className="page-toolbar">
        <div>
          <h2>Einstellungen</h2>
          <div className="sub">SkyDrive 1.0 · echte Laufwerksanalyse, keine Demo-Werte.</div>
        </div>
      </div>
      <section className="card">
        <p>
          Angemeldet als <strong>{profileName}</strong>
        </p>
        <p className="note">
          Scans laufen im Hintergrund. Geschützte Systempfade werden nicht gelöscht. Duplikate und Temp-Dateien
          erfordern immer eine Bestätigung.
        </p>
      </section>
    </div>
  )
}
