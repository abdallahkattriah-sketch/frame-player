// Draws Frame's app icon (Midnight Cinema colors) as a 256×256 PNG: build/icon.png.
// No image libraries: shapes are rasterized with 4×4 supersampling and encoded with zlib.
// Usage: node scripts/build/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SIZE = 256
const SS = 4
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const BG = hex('#1B1E25')
const EDGE = hex('#303541')
const ACCENT = hex('#E5A15B')
const TEXT = hex('#F0EEE9')

/** Inside a rounded rectangle [x0,x1]×[y0,y1] with corner radius r. */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** Inside the triangle (a, b, c). */
function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  const d1 = s(x, y, ax, ay, bx, by)
  const d2 = s(x, y, bx, by, cx, cy)
  const d3 = s(x, y, cx, cy, ax, ay)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/** Color of one sample point, or null for transparent. */
function sample(x, y) {
  // Tile with a subtle edge.
  if (!inRoundRect(x, y, 8, 8, 248, 248, 52)) return null
  if (!inRoundRect(x, y, 12, 12, 244, 244, 48)) return EDGE
  // The "frame": an accent outline.
  const outer = inRoundRect(x, y, 52, 68, 204, 188, 18)
  const inner = inRoundRect(x, y, 66, 82, 190, 174, 8)
  if (outer && !inner) return ACCENT
  // Play symbol inside it.
  if (inTriangle(x, y, [112, 100], [112, 156], [158, 128])) return TEXT
  return BG
}

const rows = []
for (let py = 0; py < SIZE; py++) {
  const row = Buffer.alloc(1 + SIZE * 4) // filter byte + RGBA
  for (let px = 0; px < SIZE; px++) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)
        if (!c) continue
        r += c[0]
        g += c[1]
        b += c[2]
        a++
      }
    }
    const o = 1 + px * 4
    if (a > 0) {
      row[o] = Math.round(r / a)
      row[o + 1] = Math.round(g / a)
      row[o + 2] = Math.round(b / a)
      row[o + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
  rows.push(row)
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8 // bit depth
header[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = join(root, 'build', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`make-icon: wrote ${out} (${png.length} bytes)`)
