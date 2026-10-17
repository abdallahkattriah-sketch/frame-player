import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { InvalidIpcArgumentsError, parseIpcArgs } from '../../../src/main/ipc/handle'
import { IpcChannel } from '@shared/contracts/channels'
import { credentialIdSchema, credentialSecretSchema } from '@shared/contracts/credentials'
import { settingsPatchSchema } from '@shared/settings/schema'

const setCredentialArgs = z.tuple([credentialIdSchema, credentialSecretSchema])

describe('parseIpcArgs', () => {
  it('accepts valid arguments and trims secrets', () => {
    expect(
      parseIpcArgs(IpcChannel.CredentialsSet, setCredentialArgs, ['tmdb.accessToken', ' t ']),
    ).toEqual(['tmdb.accessToken', 't'])
  })

  it('rejects unknown credential ids, empty secrets, and extra arguments', () => {
    const bad: unknown[][] = [
      ['not-a-provider', 'x'],
      ['tmdb.accessToken', '   '],
      ['tmdb.accessToken', 'x', 'extra'],
      [],
    ]
    for (const args of bad) {
      expect(() => parseIpcArgs(IpcChannel.CredentialsSet, setCredentialArgs, args)).toThrow(
        InvalidIpcArgumentsError,
      )
    }
  })

  it('rejects settings patches with unknown keys or out-of-range values', () => {
    const schema = z.tuple([settingsPatchSchema])
    expect(() =>
      parseIpcArgs(IpcChannel.SettingsUpdate, schema, [{ playback: { seekStepSeconds: 9999 } }]),
    ).toThrow(InvalidIpcArgumentsError)
    expect(() =>
      parseIpcArgs(IpcChannel.SettingsUpdate, schema, [{ shell: { command: 'calc' } }]),
    ).toThrow(InvalidIpcArgumentsError)
    expect(
      parseIpcArgs(IpcChannel.SettingsUpdate, schema, [
        { privacy: { onlineSubtitlesEnabled: false } },
      ]),
    ).toEqual([{ privacy: { onlineSubtitlesEnabled: false } }])
  })
})
