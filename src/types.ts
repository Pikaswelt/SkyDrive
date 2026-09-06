export type DriveInfo = {
  id: string
  name: string
  mount: string
  total: number
  used: number
  free: number
  fs: string
  kind: string
  is_removable: boolean
}

export type UserProfile = {
  username: string
  display_name: string
  home: string
}

export type ScanProgress = {
  drive: string
  status: string
  current_path: string
  files_scanned: number
  dirs_scanned: number
  bytes_scanned: number
  percent: number
  message: string
}

export type NamedSize = {
  key: string
  label: string
  bytes: number
  percent: number
  color: string
}

export type FileEntry = {
  name: string
  path: string
  size: number
  mtime: number
  ext: string
  kind: string
  inaccessible: boolean
}

export type FolderChild = {
  name: string
  path: string
  is_dir: boolean
  size: number | null
  file_count: number | null
  dir_count: number | null
  mtime: number | null
  percent: number
  types: NamedSize[]
  inaccessible: boolean
  note: string | null
}

export type FolderDetail = {
  name: string
  path: string
  size: number | null
  file_count: number | null
  dir_count: number | null
  mtime: number | null
  percent: number
  types: NamedSize[]
  children: FolderChild[]
  inaccessible: boolean
  note: string | null
}

export type ScanSummary = {
  drive: DriveInfo
  scanned_at: number
  scanned_bytes: number
  file_count: number
  dir_count: number
  inaccessible_bytes: number
  inaccessible_count: number
  dashboard: NamedSize[]
  detailed: NamedSize[]
  file_types: NamedSize[]
  recent_files: FileEntry[]
  large_files: FileEntry[]
}

export type DuplicateGroup = {
  hash: string
  size: number
  files: FileEntry[]
  wasted: number
}

export type DuplicateReport = {
  groups: DuplicateGroup[]
  wasted: number
  file_count: number
  status: string
}

export type TempCategory = {
  key: string
  label: string
  bytes: number
  file_count: number
  cautious: boolean
  description: string
  samples: FileEntry[]
}

export type TempReport = {
  categories: TempCategory[]
  total_bytes: number
  total_files: number
}

export type TrashItem = {
  name: string
  path: string
  size: number
  is_dir: boolean
}

export type ActionResult = {
  ok: boolean
  message: string
  freed: number
}

export type Page =
  | "overview"
  | "storage"
  | "files"
  | "duplicates"
  | "large"
  | "downloads"
  | "trash"
  | "settings"
  | "temp"
