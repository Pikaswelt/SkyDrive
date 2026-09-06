export function formatBytes(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—"
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB", "PB"]
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const d = v >= 100 || i === 0 ? 0 : digits
  return `${v.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d })} ${units[i]}`
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const d = n >= 10 ? 0 : 1
  return `${n.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: 0 })} %`
}

export function relativeDate(mtime: number): string {
  if (!mtime) return "—"
  const then = new Date(mtime * 1000)
  const now = new Date()
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()
  const days = Math.round((startNow - startThen) / 86400000)
  if (days <= 0) return "Heute"
  if (days === 1) return "Gestern"
  if (days < 7) return `Vor ${days} Tagen`
  return then.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })
}

export function formatDateTime(mtime: number): string {
  if (!mtime) return "—"
  return new Date(mtime * 1000).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function driveLetter(mount: string): string {
  const m = mount.replace(/\\/g, "/")
  const win = m.match(/^([A-Za-z]:)/)
  if (win) return win[1]
  if (m === "/") return "/"
  return mount
}

export function usageRatio(used: number, total: number): number {
  if (!total) return 0
  return Math.min(100, (used / total) * 100)
}
