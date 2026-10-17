import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  credentialIds,
  type CredentialId,
  type CredentialStoreStatus,
} from '@shared/contracts/credentials'

/** The subset of Electron's `safeStorage` the store needs (DPAPI on Windows). */
export interface StringCipher {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

export class CredentialEncryptionUnavailableError extends Error {
  constructor() {
    super('Secure credential storage is not available on this system.')
    this.name = 'CredentialEncryptionUnavailableError'
  }
}

const fileSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), z.string()),
})

type CredentialFile = z.infer<typeof fileSchema>

/**
 * Stores secrets encrypted with the OS credential facility in a single file.
 * Plaintext never touches disk; if encryption is unavailable, writes are refused.
 * Values are only readable in the main process.
 */
export class CredentialStore {
  constructor(
    private readonly filePath: string,
    private readonly cipher: StringCipher,
    private readonly warn: (message: string) => void = console.warn,
    private readonly now: () => Date = () => new Date(),
  ) {}

  status(): CredentialStoreStatus {
    const entries = this.read().entries
    const credentials = Object.fromEntries(
      credentialIds.map((id) => [id, entries[id] !== undefined]),
    ) as CredentialStoreStatus['credentials']
    return { encryptionAvailable: this.cipher.isEncryptionAvailable(), credentials }
  }

  get(id: CredentialId): string | undefined {
    const encoded = this.read().entries[id]
    if (encoded === undefined) return undefined
    if (!this.cipher.isEncryptionAvailable()) throw new CredentialEncryptionUnavailableError()
    try {
      return this.cipher.decryptString(Buffer.from(encoded, 'base64'))
    } catch {
      this.warn(`credentials: "${id}" could not be decrypted; it must be entered again`)
      return undefined
    }
  }

  set(id: CredentialId, secret: string): void {
    if (!this.cipher.isEncryptionAvailable()) throw new CredentialEncryptionUnavailableError()
    const file = this.read()
    file.entries[id] = this.cipher.encryptString(secret).toString('base64')
    this.write(file)
  }

  delete(id: CredentialId): void {
    const file = this.read()
    if (file.entries[id] === undefined) return
    const entries = Object.fromEntries(Object.entries(file.entries).filter(([key]) => key !== id))
    this.write({ ...file, entries })
  }

  private read(): CredentialFile {
    if (!existsSync(this.filePath)) return { version: 1, entries: {} }
    try {
      return fileSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')))
    } catch {
      const stamp = this.now().toISOString().replaceAll(':', '-')
      const aside = `${this.filePath}.corrupt-${stamp}`
      renameSync(this.filePath, aside)
      this.warn(`credentials: unreadable credential file moved to ${aside}`)
      return { version: 1, entries: {} }
    }
  }

  private write(file: CredentialFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(file), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, this.filePath)
  }
}
