import { inflateRawSync } from 'node:zlib'

/**
 * Minimal, defensive ZIP reader for subtitle archives (SubSource delivers ZIPs). Reads the
 * central directory, supports stored and deflated entries only, never writes to disk, and
 * enforces size limits so a malicious archive cannot exhaust memory.
 */

export interface ZipEntry {
  /** Entry name with any directory part removed; never contains path separators. */
  name: string
  bytes: Buffer
}

export class InvalidArchiveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidArchiveError'
  }
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const MAX_ENTRIES = 200
const MAX_ENTRY_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_BYTES = 50 * 1024 * 1024
const MAX_RATIO = 200

export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  )
}

/** Basename of an archive entry; entries that try to escape (.., absolute, drive) are dropped. */
export function safeEntryName(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null
  if (normalized.split('/').some((part) => part === '..')) return null
  const base = normalized.split('/').pop() ?? ''
  // Control characters are deliberately matched: they are invalid in Windows file names.
  // eslint-disable-next-line no-control-regex
  if (!base || base === '.' || /[\u0000-\u001f<>:"|?*]/.test(base)) return null
  return base
}

/** Extracts files whose names pass `accept`. Directories and unsafe names are skipped. */
export function readZip(data: Buffer, accept: (name: string) => boolean = () => true): ZipEntry[] {
  let eocd = -1
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65_535); i--) {
    if (data.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new InvalidArchiveError('The archive is damaged (no central directory).')

  const count = data.readUInt16LE(eocd + 10)
  const dirOffset = data.readUInt32LE(eocd + 16)
  if (count > MAX_ENTRIES) throw new InvalidArchiveError('The archive has too many files.')

  const entries: ZipEntry[] = []
  let total = 0
  let p = dirOffset
  for (let n = 0; n < count; n++) {
    if (p + 46 > data.length || data.readUInt32LE(p) !== CENTRAL_SIGNATURE) {
      throw new InvalidArchiveError('The archive is damaged.')
    }
    const flags = data.readUInt16LE(p + 8)
    const method = data.readUInt16LE(p + 10)
    const compressedSize = data.readUInt32LE(p + 20)
    const size = data.readUInt32LE(p + 24)
    const nameLength = data.readUInt16LE(p + 28)
    const extraLength = data.readUInt16LE(p + 30)
    const commentLength = data.readUInt16LE(p + 32)
    const localOffset = data.readUInt32LE(p + 42)
    const utf8 = (flags & 0x0800) !== 0
    const rawName = data.subarray(p + 46, p + 46 + nameLength).toString(utf8 ? 'utf8' : 'latin1')
    p += 46 + nameLength + extraLength + commentLength

    if (rawName.endsWith('/')) continue // directory
    const name = safeEntryName(rawName)
    if (!name || !accept(name)) continue
    if (flags & 0x0001) throw new InvalidArchiveError('Encrypted archives are not supported.')
    if (size > MAX_ENTRY_BYTES) throw new InvalidArchiveError('A file in the archive is too large.')
    if (compressedSize > 0 && size / compressedSize > MAX_RATIO) {
      throw new InvalidArchiveError('The archive looks malicious (compression ratio too high).')
    }
    total += size
    if (total > MAX_TOTAL_BYTES) throw new InvalidArchiveError('The archive is too large.')

    if (localOffset + 30 > data.length || data.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new InvalidArchiveError('The archive is damaged.')
    }
    const start =
      localOffset + 30 + data.readUInt16LE(localOffset + 26) + data.readUInt16LE(localOffset + 28)
    const compressed = data.subarray(start, start + compressedSize)
    let bytes: Buffer
    if (method === 0) bytes = Buffer.from(compressed)
    else if (method === 8) bytes = inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES })
    else throw new InvalidArchiveError(`Unsupported compression method (${method}).`)
    if (bytes.length !== size)
      throw new InvalidArchiveError('The archive is damaged (size mismatch).')
    entries.push({ name, bytes })
  }
  return entries
}
