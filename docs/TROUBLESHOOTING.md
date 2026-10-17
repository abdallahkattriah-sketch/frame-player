# Troubleshooting

## Installing and starting

**"Windows protected your PC" (SmartScreen).** Frame is not code-signed yet. Choose **More
info → Run anyway** if you trust where the file came from.

**"The mpv playback engine was not found".** The `resources\mpv\mpv.exe` file is missing —
reinstall Frame (some antivirus tools quarantine it; restore it or add an exception). In
development, run `npm run setup:mpv`.

**Frame says the database could not be read and started fresh.** The unreadable file was moved
to the `backups` folder in Frame's data folder (path shown in the message). Your video files
are not affected; re-add library folders or restore a backup (close Frame, copy a
`frame-v*.db` backup over `frame.db`).

**A window is blank.** Close Frame completely and start it again. If it persists, run the
smoke test from a development checkout (`node scripts/build/smoke-test.mjs`) or report it with
your Windows version.

## Playback

**"Could not play this file".** mpv could not open it: the file may be damaged, incomplete, or
use a codec mpv does not support. Try another player to confirm.

**Black picture with sound.** Try Settings → Playback → Hardware decoding → Off, then reopen
the player. Update your graphics driver.

**"The playback engine stopped unexpectedly".** mpv crashed or was closed by another program.
Open the video again; Frame starts a new engine.

**No sound or wrong language.** Use the Audio and subtitles menu (A) to pick a track; set
preferred audio languages in Settings → Audio.

**Video does not resume where I stopped.** Resume needs at least 5 seconds watched and stops
near the end; it can be turned off in Settings → Playback.

## Subtitles

**Arabic or other scripts show as boxes.** The chosen subtitle font lacks those letters; pick a
font that has them (Segoe UI and Tahoma cover Arabic) in Subtitle Studio, or set "Styled
subtitles" to "Replace with this style".

**A subtitle file next to the video is not shown.** It must be named like the video (optionally
with a language code, e.g. `Movie.ar.srt`) or be in a `Subs` folder, and its language must be in
your preferred languages to be shown automatically. All found files are in the subtitle menu.

**Subtitles are out of sync.** Use Z / X (±100 ms) or the delay control in the subtitle menu.

**Online search shows an error for one provider.** The message says why: missing or rejected
key, plan limits, rate limits ("limiting requests"), or no network. The other provider keeps
working. Check keys in Settings → Subtitle providers and use **Test**.

**OpenSubtitles refuses a download.** Free use has a daily download quota (Frame shows how
many remain); log in with your account in Settings to raise it, or wait for the daily reset.

## Library and metadata

**Videos are not found.** Check the folder in Settings → Library and its excluded subfolders,
then **Rescan**. Only common video file types are recognized (mkv, mp4, avi, mov, webm, …).
Network drives that are offline are shown as unavailable; their videos come back when the
drive does.

**Wrong poster or title.** Item menu → **Change match…** and pick the right entry, or
**Identify…** for items in All Media → Unmatched.

**"TMDB rejected the token".** Copy the API Read Access Token again from themoviedb.org →
Settings → API and save it in Settings → TMDB metadata.

## Resetting

- Settings → General → **Reset all settings** (library, history, bookmarks and keys are kept).
- Settings → Storage and cache → clear artwork or preview caches.
- To start completely fresh, close Frame and delete its data folder (`%APPDATA%\Frame`, or
  `Frame Data` beside the portable exe). This removes your library database, history,
  bookmarks, collections and saved keys — your video files are never touched.
