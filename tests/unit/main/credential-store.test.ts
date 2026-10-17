import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  CredentialEncryptionUnavailableError,
  CredentialStore,
  type StringCipher,
} from '../../../src/main/security/credential-store'
import { useTempDirs } from './temp-dir'

const tempDir = useTempDirs()

/** Reversible stand-in for safeStorage: output never contains the plaintext. */
function fakeCipher(available = true): StringCipher {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from(Buffer.from(text, 'utf8').map((b) => b ^ 0x5a)),
    decryptString: (buf) => Buffer.from(buf.map((b) => b ^ 0x5a)).toString('utf8'),
  }
}

describe('CredentialStore', () => {
  it('stores, reads, and deletes secrets without writing plaintext', () => {
    const file = join(tempDir(), 'credentials.json')
    const store = new CredentialStore(file, fakeCipher())

    store.set('tmdb.accessToken', 'super-secret-token')
    expect(readFileSync(file, 'utf8')).not.toContain('super-secret-token')
    expect(store.get('tmdb.accessToken')).toBe('super-secret-token')
    expect(store.status().credentials['tmdb.accessToken']).toBe(true)
    expect(store.status().credentials['subsource.apiKey']).toBe(false)

    store.delete('tmdb.accessToken')
    expect(store.get('tmdb.accessToken')).toBeUndefined()
    expect(new CredentialStore(file, fakeCipher()).status().credentials['tmdb.accessToken']).toBe(
      false,
    )
  })

  it('refuses to store secrets when OS encryption is unavailable', () => {
    const file = join(tempDir(), 'credentials.json')
    const store = new CredentialStore(file, fakeCipher(false))
    expect(() => store.set('subsource.apiKey', 'k')).toThrow(CredentialEncryptionUnavailableError)
    expect(existsSync(file)).toBe(false)
    expect(store.status().encryptionAvailable).toBe(false)
  })

  it('moves an unreadable credential file aside and starts empty', () => {
    const dir = tempDir()
    const file = join(dir, 'credentials.json')
    writeFileSync(file, '{ garbage')
    const warn = vi.fn()
    const store = new CredentialStore(file, fakeCipher(), warn)

    expect(store.status().credentials['tmdb.accessToken']).toBe(false)
    expect(readdirSync(dir).some((n) => n.startsWith('credentials.json.corrupt-'))).toBe(true)
    expect(warn).toHaveBeenCalledOnce()
    store.set('tmdb.accessToken', 'new')
    expect(store.get('tmdb.accessToken')).toBe('new')
  })

  it('treats an undecryptable entry as missing', () => {
    const file = join(tempDir(), 'credentials.json')
    new CredentialStore(file, fakeCipher()).set('opensubtitles.apiKey', 'abc')
    const broken: StringCipher = {
      ...fakeCipher(),
      decryptString: () => {
        throw new Error('decrypt failed')
      },
    }
    const warn = vi.fn()
    expect(new CredentialStore(file, broken, warn).get('opensubtitles.apiKey')).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })
})
