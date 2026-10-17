// Downloads the pinned mpv Windows build, verifies its SHA-256, and unpacks it into resources/mpv.
// Usage: node scripts/setup/fetch-mpv.mjs [--force]
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const release = JSON.parse(readFileSync(join(here, 'mpv-release.json'), 'utf8'))
const targetDir = join(root, 'resources', 'mpv')
const markerPath = join(targetDir, '.frame-mpv.json')
const force = process.argv.includes('--force')

function fail(message) {
  console.error(`fetch-mpv: ${message}`)
  process.exit(1)
}

if (!force && existsSync(markerPath)) {
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  if (marker.sha256 === release.sha256 && existsSync(join(targetDir, 'mpv.exe'))) {
    console.log(`fetch-mpv: mpv ${release.tag} already present`)
    process.exit(0)
  }
}

console.log(`fetch-mpv: downloading ${release.asset}`)
const response = await fetch(release.url, { signal: AbortSignal.timeout(300_000) })
if (!response.ok) fail(`download failed: HTTP ${response.status}`)
const archive = Buffer.from(await response.arrayBuffer())

const digest = createHash('sha256').update(archive).digest('hex')
if (digest !== release.sha256) fail(`checksum mismatch: expected ${release.sha256}, got ${digest}`)

const workDir = mkdtempSync(join(tmpdir(), 'frame-mpv-'))
try {
  const archivePath = join(workDir, release.asset)
  writeFileSync(archivePath, archive)

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })

  // Windows 10+ ships bsdtar (libarchive), which reads .7z.
  const result = spawnSync('tar', ['-xf', archivePath, '-C', targetDir], { stdio: 'inherit' })
  if (result.status !== 0) fail(`extraction failed (tar exit code ${result.status ?? 'unknown'})`)
  if (!existsSync(join(targetDir, 'mpv.exe'))) fail('mpv.exe not found in the archive')

  writeFileSync(
    markerPath,
    JSON.stringify({ tag: release.tag, asset: release.asset, sha256: release.sha256 }, null, 2),
  )
  console.log(`fetch-mpv: mpv ${release.tag} installed to ${targetDir}`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
