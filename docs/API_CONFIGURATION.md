# API configuration

All online features are optional. Frame plays local files and manages the library without any
account. Keys are entered in **Settings** (or during first-run setup), encrypted with Windows
DPAPI, and used only by the main process. The interface never receives them back; it only shows
"Saved (encrypted)".

Switch online features off in **Settings → Privacy** at any time; no requests are made while
they are off.

## TMDB (movie and TV information)

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/).
2. Go to **Settings → API** and request an API key (personal/non-commercial use).
3. Copy the **API Read Access Token** (a long token starting with `eyJ`). The older v3 **API
   Key** (32 hexadecimal characters) also works.
4. In Frame: **Settings → TMDB metadata → TMDB token → Save**. Frame tests it immediately.

How Frame uses it:

- Requests go to `https://api.themoviedb.org/3` with `Authorization: Bearer <token>` (or
  `api_key=<key>` for a v3 key). Images come from TMDB's image server.
- Sent: titles and years parsed from file names (and season/episode numbers). Never file paths,
  file contents or anything identifying you.
- Matches are automatic only when Frame is confident; others wait in **All Media → Unmatched**
  for you to choose. Language of titles and descriptions: Settings → TMDB metadata.
- Responses and images are cached locally, refreshed after 30 days and deleted after 180 days
  (TMDB's terms allow caching for up to six months).
- Attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB." is
  shown in Settings with TMDB's logo, as TMDB requires. TMDB's API terms are for non-commercial
  use; commercial distribution needs a commercial agreement with TMDB.

## OpenSubtitles and SubSource

See [SUBTITLE_PROVIDERS.md](SUBTITLE_PROVIDERS.md).

## Live tests with your keys

Developers can check the integrations against the real services without storing keys anywhere:

```powershell
$env:FRAME_TEST_TMDB_TOKEN = '...'
$env:FRAME_TEST_OPENSUBTITLES_KEY = '...'
$env:FRAME_TEST_SUBSOURCE_KEY = '...'
npx vitest run tests/integration
```

Never commit keys, paste them into issues, or put them in files in the repository.
