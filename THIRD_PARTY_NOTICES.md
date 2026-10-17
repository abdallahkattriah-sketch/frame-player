# Third-party notices

Frame's own code is licensed under the MIT License (see `LICENSE`). Frame includes the
following third-party software. Full license texts are installed in the `resources/licenses`
folder of the installation.

## mpv (separate program, GPLv2+)

Frame plays video by running **mpv** as a separate program (`resources/mpv/mpv.exe`) and
controlling it over a local pipe. Frame does not link to mpv.

- Version: mpv v0.41.0-1092-g3186d369f (source commit
  [`3186d369f9`](https://github.com/mpv-player/mpv/commit/3186d369f9)), with FFmpeg
  N-127117-g98e92563a, libass, libplacebo and other libraries.
- Windows build: [shinchiro/mpv-winbuild-cmake](https://github.com/shinchiro/mpv-winbuild-cmake),
  release `20261003`, asset `mpv-x86_64-20261003-git-3186d369f9.7z`
  (SHA-256 `0f616bde3216dd14a0e460892f346406ad976163c47fb49a8e2ea079cca73699`).
- This build is configured with the `gpl` feature, so mpv as distributed here is licensed under
  the **GNU General Public License, version 2 or later**. License texts:
  `mpv-Copyright.txt`, `mpv-LICENSE.GPL.txt`, `mpv-LICENSE.LGPL.txt`.
- **Source code:** the corresponding source is mpv at the commit above
  (<https://github.com/mpv-player/mpv>) plus the build recipe and pinned library sources of
  the shinchiro release above (<https://github.com/shinchiro/mpv-winbuild-cmake>). If you
  received Frame from someone who distributes it publicly, they are responsible for providing
  this source under the terms of GPLv2 section 3.

## Electron and Chromium

Frame is built with Electron 44 (MIT), which includes Chromium and Node.js. Their licenses are
in `LICENSE.electron.txt` and `LICENSES.chromium.html` in the installation folder.

## Libraries

Licensed under MIT unless noted; texts in `THIRD-PARTY-LICENSES.txt`:

- zod — schema validation (main process)
- koffi and @koromix/koffi-win32-x64 — calls into Windows APIs (main process)
- React, React DOM, scheduler — user interface
- lucide-react (ISC) — icons
- @tanstack/react-virtual, @tanstack/virtual-core — virtualized lists
- Tailwind CSS — styling (generated CSS)

## Data and services

- Movie and TV information and images are provided by
  [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or
  certified by TMDB. The TMDB logo is used under TMDB's attribution guidelines.
- Subtitle search uses [OpenSubtitles](https://www.opensubtitles.com/) and
  [SubSource](https://subsource.net/) with the user's own API keys, under their terms.
