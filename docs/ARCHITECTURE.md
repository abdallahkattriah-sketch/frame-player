# Architecture

Frame is an Electron application with three layers: a sandboxed React interface, a typed
preload bridge, and a main process that owns all files, data, network access and the mpv
player process.

```
Renderer windows (React, sandboxed, no Node.js)
  ├─ main window: library, settings, dialogs        src/renderer/src
  └─ player overlay: transparent controls window    src/renderer/src/features/player
        │  window.frame.*  (preload: contextBridge, fixed channel list)   src/preload
        ▼
Main process                                         src/main
  ├─ ipc/           every channel: sender check + zod argument schema
  ├─ application/   player controller, history, bookmarks, settings, storage, bootstrap
  ├─ media-engine/  mpv process + JSON IPC client, state mapping, thumbnails, window order
  ├─ library/       folder walker, filename parser, scanning and watching
  ├─ metadata/      TMDB client, matching, artwork cache + frame-art:// protocol
  ├─ subtitles/     provider interface, OpenSubtitles, SubSource, ranking, safe downloads
  ├─ database/      node:sqlite connection, migrations, repositories
  ├─ network/       HTTP client (timeouts, retries, rate limits, validated responses)
  └─ security/      window hardening, encrypted credential store
src/shared          contracts (IPC types and schemas), settings schemas, constants
```

## Playback

- mpv runs as a **separate process** (`resources/mpv/mpv.exe`), started without a shell, with
  user config and scripts disabled, and controlled over a per-instance named pipe using mpv's
  JSON IPC.
- The player window is a native `BaseWindow`; mpv draws into it via `--wid`. A transparent
  `BrowserWindow` owned by it renders the controls. Chromium creates a compositor child window
  that would cover the video, so Frame raises mpv's child window (Win32 `SetWindowPos` through
  koffi) whenever needed.
- Player state shown in the UI is derived only from observed mpv properties; the UI never
  simulates playback. Renderer commands are high-level (`seek`, `set-volume`, …) and mapped to
  mpv commands in the main process — raw mpv commands are never accepted.
- Timeline previews come from short-lived headless mpv processes (one frame each), queued,
  cancellable and cached per file.

## Data

- SQLite through Node's built-in `node:sqlite` in WAL mode, schema version in
  `PRAGMA user_version`, migrations in `src/main/database/migrations.ts` (v1–v6). The database
  is copied to `backups/` before each migration; an unreadable database is moved aside and a
  new one created.
- Local files and TMDB records are separate: a file is identified by its normalized path
  (`path_key`); matches link files (movies) or show titles (episodes) to TMDB ids. Files stay
  playable whether or not they match. History, bookmarks and collections refer to files, not to
  metadata.
- Settings are stored per section as JSON, validated with zod and merged over defaults.
- Credentials are encrypted with Electron `safeStorage` (Windows DPAPI) in `credentials.json`;
  the renderer only learns whether each one is set.
- User data folder: `%APPDATA%\Frame` (installed), `Frame Data` beside the portable exe.

## Network

All requests go through one HTTP client with timeouts, per-host concurrency limits, retries on
server errors and HTTP 429 (honoring `Retry-After`), and schema validation of responses.
TMDB responses and artwork are cached (refreshed after 30 days, removed after 180 days per
TMDB's terms). Online features can be switched off entirely.

## Renderer

React 19 with Tailwind CSS on semantic CSS variables (themes change the variables only).
Library grids and lists are virtualized. Settings are shared through one provider per window,
kept in sync by `settings:changed` pushes from the main process.
