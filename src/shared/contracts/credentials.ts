import { z } from 'zod'

export const credentialIds = [
  'tmdb.accessToken',
  'opensubtitles.apiKey',
  'opensubtitles.username',
  'opensubtitles.password',
  'subsource.apiKey',
] as const

export const credentialIdSchema = z.enum(credentialIds)
export type CredentialId = z.infer<typeof credentialIdSchema>

export const credentialSecretSchema = z
  .string()
  .trim()
  .min(1, 'Value must not be empty')
  .max(4096, 'Value is too long')

/** What the renderer may learn about credentials: whether each one is set, never its value. */
export type CredentialStatus = Record<CredentialId, boolean>

export interface CredentialStoreStatus {
  encryptionAvailable: boolean
  credentials: CredentialStatus
}
