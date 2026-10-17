# Setup (users)

## Install

- **Installer:** run `Frame-Setup-<version>.exe`. It installs for your Windows account (no
  administrator rights needed), lets you choose the folder, and adds Start menu and desktop
  shortcuts. Uninstalling keeps your library and settings.
- **Portable:** run `Frame-<version>-portable.exe` from any folder (for example a USB drive).
  It keeps all its data in a `Frame Data` folder next to the exe.

Frame is not code-signed yet. If Windows SmartScreen shows "Windows protected your PC", choose
**More info → Run anyway** only if you got the file from a source you trust.

## First run

A short, optional setup appears the first time:

1. **Library** — add the folders with your movies and shows. Frame scans them in the
   background and never changes, moves or deletes your files.
2. **TMDB** — paste a TMDB token for posters and details (optional).
3. **Subtitles** — choose preferred languages; optionally add OpenSubtitles/SubSource keys.
4. **Theme** — pick a look.

Skip any step; everything is in **Settings** later (Settings → General → Run first-time setup
again).

## Where Frame keeps data

|                                                         | Installed                 | Portable                 |
| ------------------------------------------------------- | ------------------------- | ------------------------ |
| Library, history, settings (`frame.db`), encrypted keys | `%APPDATA%\Frame`         | `Frame Data\`            |
| Artwork and preview caches                              | `%APPDATA%\Frame\cache`   | `Frame Data\cache`       |
| Database backups                                        | `%APPDATA%\Frame\backups` | `Frame Data\backups`     |
| Screenshots                                             | `Pictures\Frame`          | `Frame Data\screenshots` |

Settings → Storage and cache shows the sizes and can clear caches or back up the database.
Encrypted keys can only be read by the same Windows account on the same computer; after moving
to another PC, enter them again.
