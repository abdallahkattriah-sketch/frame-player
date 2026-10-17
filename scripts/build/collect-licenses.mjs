// Gathers the license texts of the libraries shipped inside Frame into
// build/licenses/THIRD-PARTY-LICENSES.txt (packaged next to the app).
// Usage: node scripts/build/collect-licenses.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Runtime libraries (main process) and libraries bundled into the renderer. */
const shipped = [
  'zod',
  'koffi',
  '@koromix/koffi-win32-x64',
  'react',
  'react-dom',
  'scheduler',
  'lucide-react',
  '@tanstack/react-virtual',
  '@tanstack/virtual-core',
  'tailwindcss',
]

const sections = []
const missing = []
for (const name of shipped) {
  const dir = join(root, 'node_modules', name)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f))
  if (!file) {
    missing.push(name)
    continue
  }
  sections.push(
    `${'='.repeat(78)}\n${name} ${pkg.version} — ${pkg.license}\n${'='.repeat(78)}\n\n` +
      readFileSync(join(dir, file), 'utf8').trim(),
  )
}
if (missing.length > 0) {
  // koffi's platform package carries its license in package.json only (MIT, same author).
  const known = missing.filter((n) => n === '@koromix/koffi-win32-x64')
  const unknown = missing.filter((n) => !known.includes(n))
  if (unknown.length > 0) {
    console.error(`collect-licenses: no license file for ${unknown.join(', ')}`)
    process.exit(1)
  }
  sections.push(
    `${'='.repeat(78)}\n@koromix/koffi-win32-x64 — MIT\n${'='.repeat(78)}\n\n` +
      'Prebuilt Windows binary of koffi; licensed under the koffi license above.',
  )
}

const out = join(root, 'build', 'licenses', 'THIRD-PARTY-LICENSES.txt')
if (!existsSync(dirname(out))) throw new Error(`missing ${dirname(out)}`)
writeFileSync(
  out,
  'Licenses of the open-source libraries included in Frame.\n' +
    'Electron and Chromium licenses are in LICENSE.electron.txt and LICENSES.chromium.html\n' +
    'in the installation folder; mpv licenses are in the mpv-*.txt files beside this one.\n\n' +
    sections.join('\n\n') +
    '\n',
)
console.log(`collect-licenses: ${sections.length} entries -> ${out}`)
