# Security and privacy

Frame is local-first: the library, history, settings and caches are stored on your computer.
It has no accounts, servers, analytics or telemetry.

## What leaves your computer

Only when the matching feature is set up and switched on (Settings → Privacy):

| Service       | Sent                                                                                                                                                  | Never sent                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| TMDB          | Titles and years parsed from file names, season/episode numbers, text you type in search (if TMDB search is on), your TMDB token, the chosen language | File paths, files, hashes |
| OpenSubtitles | Title/year or TMDB/IMDb ids, season/episode, languages, your API key (and login if set); the 16-character file hash only if you opt in                | Files, paths              |
| SubSource     | Title or IMDb id, languages, your API key                                                                                                             | Files, paths, hashes      |

## Credentials

- Stored encrypted with Windows DPAPI (Electron `safeStorage`) in `credentials.json`; readable
  only by the same Windows user on the same computer.
- Used only in the main process. The interface receives "set / not set" and never the value.
- Never logged; network error messages contain host names only (tested).
- OpenSubtitles login tokens are kept in memory and the session is logged out on exit.

## Application hardening

- Renderer windows: `contextIsolation`, `sandbox`, no `nodeIntegration`, strict Content
  Security Policy, navigation and new windows blocked, webviews blocked, every permission
  request (camera, microphone, notifications, …) denied.
- The preload exposes a fixed, typed API. Every IPC request is refused unless it comes from one
  of Frame's own pages, and its arguments are validated against a schema before any code runs
  (tested for every channel).
- File access is limited to what the user chose (native dialogs, dropped files that must be
  existing videos, library folders); paths for playback come from the database, not from the
  page. The `frame-art://` protocol serves only cache files whose names Frame generates.
- The only web page Frame opens in your browser is a title's page on themoviedb.org, built from
  a validated TMDB id in the main process.
- No shell execution. mpv is started with an argument array, without a shell, with user
  configuration and scripts disabled and online streaming disabled (`--ytdl=no`); the renderer
  can only send high-level player commands, never raw mpv commands. mpv cannot outlive Frame.
- Imported files are data only and validated: themes (name + hex colors), shortcut files
  (known actions + key names), both limited to 64 KB. Subtitle downloads are checked (no HTML or
  binaries), ZIPs are read in memory with limits and no path traversal, existing files are never
  overwritten without asking.
- Packaged builds: Electron fuses disable `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and inspector
  flags, and enable asar integrity checking and loading the app only from its archive.
  Development-only environment variables are ignored.

## Review record

2026-10-18 (milestone M8, updated M9): code review of IPC, process spawning, logging, file
handling and window security; `npm audit`: no known vulnerabilities in the shipped
dependencies (one moderate issue in build-time tooling, see BUILDING.md); acceptance results in
[TESTING.md](TESTING.md).

## Known gaps

- Builds are not code-signed (see BUILDING.md).
- The bundled mpv is a third-party binary from the shinchiro build, verified by SHA-256 against
  the pinned release; update it deliberately when mpv security fixes are released.

## Reporting a problem

Please report security issues privately to the maintainer rather than in a public issue, with
steps to reproduce. Do not include API keys or personal files.
