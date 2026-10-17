# Testing and acceptance

How each acceptance criterion from the project specification (§22) is verified, and how to run
the checks. Last full run: 2026-10-18, Windows 11, Electron 44 — 217 unit tests passed
(9 live-API tests skipped without keys), 23/23 end-to-end tests passed.

## Running the checks

| Command                                 | What it runs                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                     | TypeScript for main, preload, renderer and tests                                                                              |
| `npm run lint` / `npm run format:check` | ESLint (incl. React Compiler rules) and Prettier                                                                              |
| `npm test`                              | Unit and component tests (Vitest). Tests that need the bundled mpv and the test videos skip themselves when those are missing |
| `npm run build && npm run test:e2e`     | End-to-end tests (Playwright driving the built Electron app)                                                                  |
| `npx vitest run tests/integration`      | Live checks against TMDB, OpenSubtitles and SubSource — only with your own keys in environment variables (see below)          |

E2E and some unit tests need `npm run setup:mpv` and `npm run setup:test-media` first. E2E tests
use a temporary user-data folder each (`FRAME_USER_DATA_DIR`) and skip first-run setup
(`FRAME_SKIP_SETUP=1`); both overrides are ignored by packaged builds.

Live checks (keys are read from the environment and never written anywhere):

```powershell
$env:FRAME_TEST_TMDB_TOKEN = '...'
$env:FRAME_TEST_OPENSUBTITLES_KEY = '...'      # optional: _USER and _PASS
$env:FRAME_TEST_SUBSOURCE_KEY = '...'
$env:FRAME_TEST_ALLOW_DOWNLOAD = '1'           # optional: downloads one subtitle per provider
npx vitest run tests/integration
```

## Kinds of evidence

- **Automated** — runs against real components (SQLite, the bundled mpv, the built app).
- **Mocked** — runs against local servers that imitate TMDB / OpenSubtitles / SubSource with
  responses shaped like their documented APIs. No real request is made.
- **Manual** — checked by a person; recorded here with the date.
- **Not run** — could not be executed yet, and why.

## Results

### Application

| Criterion                                            | Evidence  | Where                                                                                                                              |
| ---------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Starts without any API key                           | Automated | every e2e test starts with an empty profile                                                                                        |
| Settings persist after restarting                    | Automated | `app-launch.spec` "settings persist across restarts"; shortcuts/theme after restart in `customization.spec`                        |
| Database initialization and migrations               | Automated | `database.test` (fresh, upgrade from older versions, backup before migrating, newer-than-app refused)                              |
| Corrupt database                                     | Automated | `app-launch.spec` "a corrupt database is backed up and the app still starts"                                                       |
| Invalid settings handled safely                      | Automated | `settings-service.test` (invalid sections fall back to defaults), `ipc-args.test`                                                  |
| Renderer has no unrestricted Node.js access          | Automated | `app-launch.spec` (no `require`/`process` in pages), `web-security.test`, `preload-imports.test`                                   |
| Every IPC channel validates its sender and arguments | Automated | `ipc-handlers.test`: all channels registered; malformed arguments and foreign pages are refused before any service runs            |
| Secrets never reach the renderer or error messages   | Automated | `app-launch.spec` "secrets never cross the bridge", `http-client.test` (no credentials in error messages), `credential-store.test` |

### Playback

| Criterion                                     | Evidence  | Where                                                                                                                                                               |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A local video opens and plays                 | Automated | `playback.spec` — position advances from mpv's own reports                                                                                                          |
| Play/pause, seeking, volume, fullscreen       | Automated | `playback.spec`, `player-tools.spec`                                                                                                                                |
| Timeline reflects real playback state         | Automated | `playback.spec`, `player-tools.spec` (hover previews generated by mpv)                                                                                              |
| Audio and subtitle tracks can be changed      | Automated | `playback.spec` "player controls drive mpv"                                                                                                                         |
| Position restored after restarting            | Automated | `library-browse.spec`                                                                                                                                               |
| Invalid or missing media gives a useful error | Automated | `playback.spec` "shows a useful error for a file mpv cannot play"                                                                                                   |
| Paths with spaces and Unicode                 | Automated | test media lives in `أفلام test/`, one clip is named `فيلم تجريبي 映画.mkv`; temp folders contain Arabic text                                                       |
| Closing the app cleans up mpv                 | Automated | `playback.spec` (mpv gone after close)                                                                                                                              |
| mpv does not outlive a crashed Frame          | Automated | `resilience.spec` (main process killed; its mpv ends). On Windows, Node places non-detached children in a kill-on-close job object; mpv is never spawned `detached` |
| An mpv crash is reported and recoverable      | Automated | `resilience.spec`                                                                                                                                                   |

### Library

| Criterion                                      | Evidence  | Where                                                                                                                                                                           |
| ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scanning finds supported media                 | Automated | `library-service.test`, `library.spec`                                                                                                                                          |
| Duplicate scans create no duplicates           | Automated | `library-service.test` (rescans, concurrent scan requests joined)                                                                                                               |
| Removed files handled                          | Automated | `library-service.test`, `library.spec` (missing files, unavailable folders)                                                                                                     |
| Unmatched media remains playable               | Automated | `metadata.spec`, `library-browse.spec`                                                                                                                                          |
| Manual metadata correction                     | Mocked    | `metadata.spec`                                                                                                                                                                 |
| Failed TMDB request does not break the library | Mocked    | `metadata-service.test`, `metadata.spec` (online lookups off)                                                                                                                   |
| Artwork caching                                | Mocked    | `metadata.spec` (poster served from cache), `metadata-service.test`                                                                                                             |
| Large libraries                                | Automated | `library-service.test` (5,000-file scan keeps the event loop responsive); `library-scale.test` (20,000 files: list 112 ms, search 11 ms, shows 7 ms on the development machine) |
| Collections                                    | Automated | `collections.test`, `organize.spec`                                                                                                                                             |

### Subtitles

| Criterion                                       | Evidence                 | Where                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local subtitle discovery                        | Automated                | `subtitle-helpers.test`, `subtitles.spec`                                                                                                                                                                                                                       |
| Arabic subtitles render correctly               | Manual (2026-10-18)      | mpv rendered a frame with `Test Pattern (2024).ar.srt` into an image (mpv's own renderer, no screen capture): letters joined, right-to-left order, Arabic-Indic digits ١٢٣ and punctuation in the right place, Segoe UI. Re-check in the packaged app during M9 |
| Subtitle timing can be adjusted                 | Automated                | `playback.spec` (delay keys/menu → mpv `sub-delay`)                                                                                                                                                                                                             |
| Provider errors shown clearly                   | Mocked                   | `subtitles.spec` (one provider fails; its error is shown separately)                                                                                                                                                                                            |
| Missing credentials do not crash                | Automated                | `subtitle-providers.test` "reports missing keys per provider" (no requests sent); e2e runs start without keys                                                                                                                                                   |
| Results can be selected and downloaded          | Mocked; live **not run** | `subtitles.spec`; live: `subtitles-live.test` needs your keys                                                                                                                                                                                                   |
| Downloads validated before use                  | Automated                | `subtitle-helpers.test` (HTML/binary/empty rejected, encodings converted), ZIP limits                                                                                                                                                                           |
| Existing files never silently overwritten       | Mocked                   | `subtitles.spec` (asks; Cancel keeps the file)                                                                                                                                                                                                                  |
| One provider failing does not disable the other | Mocked                   | `subtitles.spec`, `subtitle-providers.test`                                                                                                                                                                                                                     |
| Subtitle appearance never changes files         | Automated                | `player-tools.spec` (file bytes unchanged); every style option checked against the bundled mpv in `subtitle-style.test`                                                                                                                                         |

### Packaging

| Criterion                                                                   | Evidence                                                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build succeeds                                                   | Automated — `npm run dist` produced the installer and the portable exe (2026-10-18)                                                                   |
| Packaged app launches, finds and starts its bundled mpv, plays a local file | Automated — `scripts/build/smoke-test.mjs` on `release/win-unpacked` and on the portable exe: playback time advances, read from mpv over its own pipe |
| No Vite or dev server needed                                                | Automated — the smoke test sets a bogus dev-server URL and fails if any window fails to load; development switches are shown to be ignored            |
| Packaged app keeps data where expected, cleans up mpv                       | Automated — smoke test (portable data folder used, `%APPDATA%\Frame` untouched, mpv ends with Frame)                                                   |
| Installer installs, creates shortcuts, uninstalls                           | **Not run** — installing changes the machine; to be done by hand on a clean Windows account                                                           |
| Arabic subtitles in the packaged app                                        | **Not run** — check by hand after installing                                                                                                          |

### Live services

| Service       | Status                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| TMDB          | **Not run** — `tmdb-live.test` skips without `FRAME_TEST_TMDB_TOKEN`                          |
| OpenSubtitles | **Not run** — needs `FRAME_TEST_OPENSUBTITLES_KEY`                                            |
| SubSource     | **Not run** — needs `FRAME_TEST_SUBSOURCE_KEY`; its language names are the main open question |

## Security

The security review and hardening measures are in [SECURITY.md](SECURITY.md).
