import { open } from 'node:fs/promises'

const CHUNK = 64 * 1024
const MASK = (1n << 64n) - 1n

/**
 * OpenSubtitles "moviehash": file size plus the 64-bit little-endian word sums of the first
 * and last 64 KiB, modulo 2^64, as 16 hex digits. Only computed when the user allows hash
 * lookups. Files smaller than 128 KiB have no meaningful hash.
 */
export async function computeMovieHash(path: string): Promise<string | null> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    if (size < CHUNK * 2) return null
    let hash = BigInt(size)
    for (const position of [0, size - CHUNK]) {
      const buffer = Buffer.alloc(CHUNK)
      const { bytesRead } = await file.read(buffer, 0, CHUNK, position)
      if (bytesRead !== CHUNK) return null
      for (let i = 0; i < CHUNK; i += 8) hash = (hash + buffer.readBigUInt64LE(i)) & MASK
    }
    return hash.toString(16).padStart(16, '0')
  } finally {
    await file.close()
  }
}
