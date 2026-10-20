# Frame

Frame is a local-first video player and media library for Windows. It plays the videos on your
computer with the [mpv](https://mpv.io/) engine, organizes them into movies and TV shows, and
can optionally fetch posters and details from TMDB and subtitles from OpenSubtitles and
SubSource using your own accounts. Everything it stores stays on your computer; it has no
accounts, analytics or telemetry.

## Features

- **Playback** with mpv: hardware decoding, audio/subtitle tracks, delays, speed, frame
  stepping, aspect and zoom, playlists with shuffle and repeat, screenshots, chapters, resume
  where you left off. Paths with spaces and any script (Arabic, CJK, …) work.
- **Timeline** with hover previews generated from the video, chapter and bookmark markers.
- **Library**: watched folders, background scanning, movie and TV episode recognition from file
  names, Continue Watching, recently added, favorites, missing-file handling, fast search, grid
  and list views that stay smooth with tens of thousands of files.
- **TMDB metadata** (optional): automatic matching with manual correction, posters, cast and
  descriptions, cached locally; searches can also show matching titles from TMDB that are not
  in your library.
- **Subtitles**: files next to your videos are found automatically; online search and safe
  download from OpenSubtitles and SubSource (optional, your own keys); Subtitle Studio for
  fonts, colors, outline, background and position with saved profiles.
- **Bookmarks** with thumbnails, **collections and playlists**.
- **People and Radar** (needs TMDB): follow actors, directors, and writers; their upcoming,
  new, and digital releases with Egyptian dates when TMDB has them (otherwise the US date,
  labeled); popular movies; suggested people; and in-app notifications for new releases.
- **Plays inside the main window**, with a close button that returns to where you were.
- **Customization**: Theme Studio (five built-in themes, custom themes, import/export, contrast
  warnings), editable keyboard shortcuts, command palette (Ctrl+K), density, text size and more.
- **First-run setup**, every step optional.

## System requirements

- Windows 10 or 11, 64-bit (x64)
- About 500 MB of disk space for the app
- Internet access only for the optional TMDB and subtitle features

## Install

Run `Frame-Setup-<version>.exe` (installs for your user account; no administrator rights), or
use `Frame-<version>-portable.exe`, which keeps its data in a `Frame Data` folder beside it.
The builds are not code-signed yet, so Windows SmartScreen may warn the first time; choose
**More info → Run anyway** if you trust the source. See [docs/SETUP.md](docs/SETUP.md).

## API credentials (optional)

Local playback and the library work without any account. To enable online features, add your
own keys in **Settings** (they are stored encrypted with Windows DPAPI):

| Service       | What you need                                              | Used for                            |
| ------------- | ---------------------------------------------------------- | ----------------------------------- |
| TMDB          | API Read Access Token (or v3 API key)                      | Posters, titles, cast, descriptions |
| OpenSubtitles | API key; optionally username and password (more downloads) | Subtitle search and download        |
| SubSource     | API key                                                    | Subtitle search and download        |

Details: [docs/API_CONFIGURATION.md](docs/API_CONFIGURATION.md) and
[docs/SUBTITLE_PROVIDERS.md](docs/SUBTITLE_PROVIDERS.md).

## Development

Requires Node.js 24 and npm 11 on Windows.

```powershell
npm install
npm run setup:mpv          # downloads the pinned mpv build (SHA-256 checked) into resources/mpv
npm run setup:test-media   # generates small test videos with mpv
npm run dev                # starts Frame with hot reload
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`. See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [docs/TESTING.md](docs/TESTING.md).

## Build the Windows installer

```powershell
npm run dist               # release/Frame-Setup-<version>.exe and release/Frame-<version>-portable.exe
node scripts/build/smoke-test.mjs   # launches the packaged app and checks real playback
```

See [docs/BUILDING.md](docs/BUILDING.md).

## Known limitations

- Windows x64 only.
- Builds are not code-signed (SmartScreen warning).
- The TMDB, OpenSubtitles and SubSource integrations were built from their official
  documentation and tested against local mock servers; they have **not yet been checked
  against the live services** with real keys (see [docs/TESTING.md](docs/TESTING.md)).
- SubSource's API cannot filter by episode, so Frame filters by release names; its language
  names are not documented and may need adjusting after a live test.
- Timeline previews are taken at the nearest keyframe and appear after a short delay.
- Packaged builds do not write a log file.
- No automatic updates.
- Radar checks TMDB when Frame starts and when Radar is opened, never in the background.
  TMDB often has no Egyptian release date; digital dates are shown only when TMDB lists them
  and do not mean a title is on a particular streaming service.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Setup](docs/SETUP.md) ·
[Development](docs/DEVELOPMENT.md) · [Building](docs/BUILDING.md) ·
[Testing](docs/TESTING.md) · [API configuration](docs/API_CONFIGURATION.md) ·
[Subtitle providers](docs/SUBTITLE_PROVIDERS.md) ·
[Troubleshooting](docs/TROUBLESHOOTING.md) · [Security](docs/SECURITY.md)

## License

Frame's code is MIT-licensed ([LICENSE](LICENSE)). It ships mpv as a separate program under
GPLv2+, plus other open-source components; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
