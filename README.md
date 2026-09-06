# SkyDrive

Anime-inspirierte Speicherverwaltung für Windows, Linux und macOS. Die Oberfläche folgt der Designvorlage (Midnight-Glass, Sidebar, Dashboard). Alle Zahlen kommen aus dem echten Dateisystem – keine Demo-Werte.

## Funktionen

- Laufwerke erkennen (inkl. USB/extern)
- Hintergrund-Scan mit Fortschritt, ohne UI-Freeze
- Hierarchische Navigation: Laufwerk → Ordner → Unterordner → Dateien
- Kategorien ohne Überschneidung (Programme, Spiele, Engines, Windows, Benutzerdateien, …)
- Große Dateien, Duplikate (Größe + Hash), temporäre Dateien, Papierkorb
- Löschen nur nach Bestätigung, Systempfade geschützt
- Öffnen / Speicherort im Explorer, Finder oder Dateimanager

## Voraussetzungen

- Node.js 20+
- Rust (für die native App)
- [Tauri 2 Systemabhängigkeiten](https://v2.tauri.app/start/prerequisites/)

## Entwicklung

```bash
npm install
npm run tauri dev
```

Nur die Oberfläche (mit echter Scan-API im Vite-Server):

```bash
npm install
npm run dev
```

Die UI läuft auf `http://127.0.0.1:43123`.

## Releases

Fertige Installer für **Windows**, **macOS** und **Linux** gibt es auf der [GitHub Releases-Seite](https://github.com/Pikaswelt/SkyDrive/releases).

| Plattform | Dateien |
|-----------|---------|
| Windows | `.exe` (NSIS-Setup) und `.msi` |
| macOS | `.dmg` (Apple Silicon + Intel) |
| Linux | `.deb`, `.AppImage`, `.rpm` |

Neue Releases werden automatisch per GitHub Actions gebaut, sobald ein Tag `v*` (z. B. `v1.0.0`) gepusht wird.

## Release lokal bauen

```bash
npm run tauri build
```

Installationspakete liegen anschließend unter `src-tauri/target/release/bundle/`.

## Hinweise

- Nicht lesbare Ordner erscheinen als **Nicht zugänglich** / **Zugriff verweigert**, nie als Schätzung.
- Die Differenz zwischen belegtem Laufwerk und gescannten Bytes wird als „Nicht zugänglich“ ausgewiesen, damit die Summe zur belegten Kapazität passt.
- Duplikate und Temp-Dateien werden niemals automatisch gelöscht.
