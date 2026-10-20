# Architecture

Frame is an Electron application with three layers: a sandboxed React interface, a typed
preload bridge, and a main process that owns all files, data, network access and the mpv
player process.

```
Renderer windows (React, sandboxed, no Node.js)
  ├─ main window: library, settings, dialogs        src/renderer/src
  └─ player overlay: transparent controls window    src/renderer/src/features/player
     (owned by the video host, which is owned by the main window: see Playback)
        │  window.frame.*  (preload: contextBridge, fixed channel list)   src/preload
        ▼
Main process                                         src/main
  ├─ ipc/           every channel: sender check + zod argument schema
  ├─ application/   player controller, history, bookmarks, settings, storage, bootstrap
  ├─ media-engine/  mpv process + JSON IPC client, state mapping, thumbnails, window order
  ├─ library/       folder walker, filename parser, scanning and watching
  ├─ metadata/      TMDB client, matching, artwork cache + frame-art:// protocol,
  │                 Radar (release tracking) and people suggestions
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
- The video host is a native `BaseWindow`; mpv draws into it via `--wid`. A transparent
  `BrowserWindow` owned by it renders the controls. Chromium creates a compositor child window
  that would cover the video, so Frame raises mpv's child window (Win32 `SetWindowPos` through
  koffi) whenever needed.
- **In the main window.** The main page reports its content area (right of the sidebar, below
  the toolbar) over `player:set-area`. The video host is then a frameless window _owned by the
  main window_ and kept exactly over that area: it follows moves, resizes, maximize, and
  restore (Windows re-shows owned windows at their own size after a restore, so the host's own
  `show`/`resize` also re-sync), and is minimized with its owner. Fullscreen puts the main
  window in fullscreen and the player fills it. The `×` button sends `close-player`: playback
  history is recorded as before, mpv is disposed, and the main window gets focus back on the
  page it was showing (that page is never navigated, so its scroll and filters are kept).
- Native windows always cover the page, so using the main window while playing (sidebar,
  search, notifications) sends `hide-player`: the player is hidden and playback continues in
  the Now Playing bar until `show-player`. `PlayerState.embedded` is `'shown'`, `'hidden'`, or
  null (own window).
- Files opened at startup wait up to 5 s for the area; without a main window the player opens
  in its own window as before.
- Player state shown in the UI is derived only from observed mpv properties; the UI never
  simulates playback. Renderer commands are high-level (`seek`, `set-volume`, …) and mapped to
  mpv commands in the main process — raw mpv commands are never accepted.
- Timeline previews come from short-lived headless mpv processes (one frame each), queued,
  cancellable and cached per file.

## Data

- SQLite through Node's built-in `node:sqlite` in WAL mode, schema version in
  `PRAGMA user_version`, migrations in `src/main/database/migrations.ts` (v1–v9). The database
  is copied to `backups/` before each migration; an unreadable database is moved aside and a
  new one created.
- Local files and TMDB records are separate: a file is identified by its normalized path
  (`path_key`); matches link files (movies) or show titles (episodes) to TMDB ids. Files stay
  playable whether or not they match. History, bookmarks and collections refer to files, not to
  metadata.
- People are identified by TMDB person id only: `followed_people` (name and photo kept for
  offline use), `dismissed_people` ("Not interested"). Stored title metadata keeps cast and key
  crew with person ids (`cast_json`, `crew_json`).
- `radar_seen` remembers every release announced as a notification (movie id + theatrical or
  digital), so each is announced once, across restarts, even after it is dismissed.
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

## People and Radar

- **Profiles** (`/person/{id}` with `combined_credits`) are cached for a week; filmography
  grouping, upcoming and recent works are computed in the renderer.
- **Radar** (`radar-service.ts`) runs only when asked: when Radar opens (a result under 6 hours
  old for the same follows is reused), on Refresh, and once 20 s after startup when
  notifications are on. Nothing runs while Frame is closed. For each followed person it reads
  the filmography (cached a day), keeps movies whose TMDB primary date is between 240 days ago
  and two years ahead (at most 150, nearest first), and reads `/movie/{id}/release_dates`
  (cached a day). Only Egypt (`EG`) and the labeled fallback `US` are kept, by type: 2/3
  theatrical, 4 digital. A digital date is never derived from a theatrical one, and a US date is
  never shown as Egyptian. The last result is saved and shown, marked stale, when offline.
- **Sections** (`radarSections` in `src/shared/contracts/radar.ts`): Coming Soon (theatrical date
  ahead, or "date not confirmed" when no theatrical date exists but TMDB's primary date is
  ahead), Newly Released, Digital Release (TMDB digital dates only), each movie once per
  section with every followed person on it; Popular Now (TMDB trending, not personalized);
  People to Follow.
- **Suggestions** (`people-recommendations.ts`): a points ranking computed locally from stored
  cast and crew (in 2+ library titles, or worked with someone followed), then TMDB's popular
  people. Each shows its reason and source; followed and dismissed people never appear.
