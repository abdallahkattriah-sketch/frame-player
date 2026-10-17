# Development

## Requirements

- Windows 10/11 x64, Node.js 24, npm 11, Git
- No compiler is needed: SQLite is Node's built-in `node:sqlite`, and koffi ships a prebuilt
  Node-API binary.

## First time

```powershell
npm install
npm run setup:mpv          # pinned shinchiro mpv build, SHA-256 verified, into resources/mpv (git-ignored)
npm run setup:test-media   # synthetic test videos + subtitles in tests/fixtures/media (git-ignored)
```

## Everyday commands

| Command                           | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Run with hot reload (electron-vite)                      |
| `npm run build`                   | Build main, preload and renderer into `out/`             |
| `npm run typecheck`               | TypeScript (strict) for all code and tests               |
| `npm run lint`                    | ESLint, including React Compiler rules                   |
| `npm run format` / `format:check` | Prettier                                                 |
| `npm test`                        | Vitest unit/component tests                              |
| `npm run test:e2e`                | Build, then Playwright end-to-end tests against Electron |

## Environment variables (development and tests only)

Packaged builds ignore all of these.

| Variable                                               | Effect                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `FRAME_USER_DATA_DIR`                                  | Use this folder instead of `%APPDATA%\Frame` (e2e tests use a temp folder each) |
| `FRAME_SKIP_SETUP=1`                                   | Mark first-run setup as done                                                    |
| `FRAME_TMDB_API_BASE`, `FRAME_TMDB_IMAGE_BASE`         | Point TMDB requests at a mock server                                            |
| `FRAME_OPENSUBTITLES_ORIGIN`, `FRAME_SUBSOURCE_ORIGIN` | Point subtitle providers at mock servers                                        |
| `FRAME_TEST_*`                                         | Keys for the live integration tests (see TESTING.md)                            |

There is deliberately no `.env` file: the only values that would go in one are API keys, and
those belong in the app's encrypted store (Settings) or in your shell session for live tests —
never in files in the repository.

Note: running `npm run dev` without `FRAME_USER_DATA_DIR` uses your real `%APPDATA%\Frame`.

## Conventions

- Main process owns files, network, database and mpv. The renderer asks through
  `window.frame` (typed in `src/shared/contracts/ipc.ts`); every new channel needs a schema in
  `register-handlers.ts` and an entry in `channels.ts`. The sandboxed preload may import only
  `electron` and `src/shared/contracts/channels.ts` (enforced by a test).
- External data (mpv properties, HTTP responses, files, settings) is validated before use.
- mpv is always spawned with an argument array, without a shell, and never `detached`.
- Database changes are new migrations; never edit an applied one.
- UI colors come only from the semantic tokens (`bg`, `surface`, `text`, `accent`, …).
- Commit messages describe what changed and why; tests accompany behavior changes.
