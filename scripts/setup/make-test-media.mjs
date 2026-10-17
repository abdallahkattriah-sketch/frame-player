// Generates small synthetic test videos with the bundled mpv (encoding mode + lavfi sources).
// Output: tests/fixtures/media (git-ignored). Paths deliberately contain spaces and non-Latin text.
// Usage: node scripts/setup/make-test-media.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const mpv = join(root, 'resources', 'mpv', 'mpv.exe')
const outDir = join(root, 'tests', 'fixtures', 'media', 'أفلام test')

if (!existsSync(mpv)) {
  console.error('make-test-media: mpv not found; run `npm run setup:mpv` first')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const clips = [
  { file: 'Test Pattern (2024).mkv', seconds: 12 },
  { file: 'فيلم تجريبي 映画.mkv', seconds: 6 },
]

// External subtitles next to the first clip (mpv loads same-name subtitles automatically).
const subtitles = {
  'Test Pattern (2024).ar.srt':
    '1\n00:00:00,500 --> 00:00:05,000\nمرحبا بكم في فريم، هذا اختبار للترجمة العربية.\n\n2\n00:00:05,500 --> 00:00:11,000\nالسطر الثاني: الأرقام ١٢٣ والنص من اليمين إلى اليسار.\n',
  'Test Pattern (2024).en.srt':
    '1\n00:00:00,500 --> 00:00:05,000\nWelcome to Frame. This is an English subtitle test.\n\n2\n00:00:05,500 --> 00:00:11,000\nSecond line of English subtitles.\n',
}
for (const [name, text] of Object.entries(subtitles)) {
  const out = join(outDir, name)
  if (!existsSync(out)) writeFileSync(out, text, 'utf8')
}

for (const clip of clips) {
  const out = join(outDir, clip.file)
  if (existsSync(out)) continue
  const result = spawnSync(
    mpv,
    [
      `av://lavfi:testsrc2=size=1280x720:rate=30:duration=${clip.seconds}`,
      `--audio-file=av://lavfi:sine=frequency=440:duration=${clip.seconds}`,
      `--o=${out}`,
      '--of=matroska',
      '--ovc=libx264',
      '--oac=aac',
      '--no-config',
      '--msg-level=all=error',
    ],
    { stdio: 'inherit' },
  )
  if (result.status !== 0 || !existsSync(out)) {
    console.error(`make-test-media: failed to create ${clip.file}`)
    process.exit(1)
  }
  console.log(`make-test-media: created ${out}`)
}
