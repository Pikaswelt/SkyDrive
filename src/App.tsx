import { useCallback, useEffect, useRef, useState } from "react"
import "./styles.css"
import * as api from "./api"
import { TitleBar, Sidebar, ScanStrip, ConfirmModal } from "./components"
import { Dashboard } from "./Dashboard"
import { StoragePage } from "./Storage"
import {
  DuplicatesPage,
  DownloadsPage,
  FilesPage,
  LargeFilesPage,
  SettingsPage,
  TempPage,
  TrashPage,
} from "./Lists"
import type { DriveInfo, Page, ScanProgress, ScanSummary, UserProfile } from "./types"

const IDLE: ScanProgress = {
  drive: "",
  status: "idle",
  current_path: "",
  files_scanned: 0,
  dirs_scanned: 0,
  bytes_scanned: 0,
  percent: 0,
  message: "Bereit",
}

export default function App() {
  const [page, setPage] = useState<Page>("overview")
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [selected, setSelected] = useState<DriveInfo | null>(null)
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [progress, setProgress] = useState<ScanProgress>(IDLE)
  const [error, setError] = useState<string | null>(null)
  const [emptyConfirm, setEmptyConfirm] = useState(false)
  const booted = useRef(false)

  const scanning = progress.status === "scanning" || progress.status === "aggregating"

  const applySummary = useCallback((s: ScanSummary) => {
    setSummary(s)
    setSelected(s.drive)
    setError(null)
  }, [])

  const scanDrive = useCallback(async (d: DriveInfo) => {
    setError(null)
    try {
      await api.startScan(d.mount)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    let unP = () => {}
    let unC = () => {}
    const boot = async () => {
      try {
        const [u, ds] = await Promise.all([api.getUserProfile(), api.listDrives()])
        setProfile(u)
        setDrives(ds)
        const primary =
          ds.find((d) => /^[cC]:/.test(d.mount) || d.mount === "/") ?? [...ds].sort((a, b) => b.total - a.total)[0]
        if (primary) {
          setSelected(primary)
          const existing = await api.getScanSummary(primary.mount)
          if (existing) applySummary(existing)
          else if (!booted.current) {
            booted.current = true
            await api.startScan(primary.mount)
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      unP = await api.onScanProgress(setProgress)
      unC = await api.onScanComplete((s) => {
        applySummary(s)
        api.listDrives().then(setDrives)
      })
    }
    void boot()
    return () => {
      unP()
      unC()
    }
  }, [applySummary])

  const onSelectDrive = (d: DriveInfo) => {
    setSelected(d)
    setPage("storage")
    api.getScanSummary(d.mount).then((s) => {
      if (s) applySummary(s)
      else {
        setSummary(null)
        scanDrive(d)
      }
    })
  }

  const greetName = profile?.display_name || "dort"

  return (
    <div className="app-frame">
      <div className="shell">
        <TitleBar
          onSettings={() => setPage("settings")}
          onRescan={() => selected && scanDrive(selected)}
          scanning={scanning}
        />
        <Sidebar page={page === "temp" ? "overview" : page} setPage={setPage} profile={profile} />
        <main className="main">
          <div className="greet">
            <h1>
              Hallo {greetName} <span className="blossom">✿</span>
            </h1>
            <p>Dein Speicher, perfekt im Blick.</p>
          </div>
          <ScanStrip progress={progress} onCancel={() => api.cancelScan()} />
          <div className="content">
            {page === "overview" && (
              <Dashboard
                summary={summary}
                drives={drives}
                selected={selected}
                onSelectDrive={onSelectDrive}
                setPage={setPage}
                onEmptyTrash={() => setEmptyConfirm(true)}
                loading={scanning && !summary}
                error={error}
              />
            )}
            {page === "storage" && <StoragePage drive={selected} summary={summary} />}
            {page === "files" && <FilesPage summary={summary} />}
            {page === "large" && <LargeFilesPage summary={summary} />}
            {page === "downloads" && <DownloadsPage drive={selected} />}
            {page === "duplicates" && <DuplicatesPage drive={selected} />}
            {page === "temp" && <TempPage drive={selected} />}
            {page === "trash" && <TrashPage />}
            {page === "settings" && <SettingsPage profileName={greetName} />}
          </div>
        </main>
      </div>
      {emptyConfirm && (
        <ConfirmModal
          title="Papierkorb leeren?"
          body="Der Inhalt des Papierkorbs wird unwiderruflich gelöscht. Es werden keine anderen Dateien angefasst."
          confirmLabel="Papierkorb leeren"
          danger
          onCancel={() => setEmptyConfirm(false)}
          onConfirm={async () => {
            try {
              await api.emptyTrash()
            } finally {
              setEmptyConfirm(false)
              setPage("trash")
            }
          }}
        />
      )}
    </div>
  )
}
