# Subtitle providers

Frame finds subtitle files next to your videos without any account. Online search is optional
and uses your own provider accounts. Configure them in **Settings → Subtitle providers**; each
provider can be switched off separately, and **Settings → Privacy** switches online subtitle
search off entirely.

## Local subtitles (no account)

Frame loads files such as `Movie.srt`, `Movie.ar.srt`, `Movie.en.forced.srt`,
`Movie.en.sdh.srt`, `Movie.pt-BR.srt`, and files in `Subs\` or `Subs\<video name>\` folders.
It shows one automatically only if it is in one of your preferred languages (Settings →
Subtitles). Formats: SRT, ASS/SSA, WebVTT and SUB.

## OpenSubtitles

1. Create an account at [opensubtitles.com](https://www.opensubtitles.com/).
2. In your profile, open **API consumers** and create one to get an **API key**.
3. In Frame: enter the API key (required) and, optionally, your username and password. Logging
   in raises the daily download limit; Frame logs in once per session and never retries a
   rejected password.

Built from OpenSubtitles' official REST API v1 specification:
`https://api.opensubtitles.com/api/v1`, `Api-Key` and `User-Agent: Frame v<version>` headers on
every request. Searches use TMDB/IMDb ids when the video is identified, otherwise the title and
year, plus season/episode and your languages. Remaining downloads are shown after each
download.

**File fingerprint (opt-in, off by default):** with Settings → Privacy → "Send a file
fingerprint", Frame sends OpenSubtitles a 16-character hash computed from the start and end of
the file, which finds subtitles made for that exact release. The file itself is never sent.

## SubSource

1. Create an account at [subsource.net](https://subsource.net/).
2. In your dashboard, open **API** and create an **API key**.
3. In Frame: enter the API key.

Built from SubSource's API documentation: `https://api.subsource.net/api/v1` with the
`X-API-Key` header. Frame looks the title up (by IMDb id when known), then lists subtitles per
language. Downloads arrive as ZIP files, which Frame opens safely in memory. Free accounts are
rate-limited (about 60 requests per minute).

Limitations: SubSource's API cannot filter by episode, so Frame keeps results whose release
names match the episode and says so. Languages are sent as English names ("arabic",
"english", …) because SubSource does not publish its language list — this has not yet been
confirmed with a live key.

## How results are ranked

Only on what the provider returned: exact file match (hash), matching TMDB/IMDb ids, matching
season and episode, your language order, release name similarity, and penalties for
machine-translated or AI-generated subtitles. Each result shows why it ranked where it did,
and "What was sent" lists every request.

## Downloads

- The file is checked before use: web pages, binaries and empty files are rejected; ZIPs are
  read with size, count and ratio limits and no path traversal.
- Text is converted to UTF-8 (UTF-16 and legacy code pages such as Windows-1256 for Arabic are
  detected).
- Saved next to the video (or a folder you choose) as `<video name>.<language>[.sdh][.forced].<ext>`.
  An existing file is never replaced without asking.
- The subtitle is loaded into the player right away.

If one provider fails or is not configured, results from the other still appear, with the
error shown separately.
