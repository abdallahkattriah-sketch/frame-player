import { ipcMain } from 'electron'
import type { z } from 'zod'
import type { IpcChannelName } from '@shared/contracts/channels'

export class InvalidIpcArgumentsError extends Error {
  constructor(channel: string, details: string) {
    super(`Invalid arguments for ${channel}: ${details}`)
    this.name = 'InvalidIpcArgumentsError'
  }
}

/** Parses renderer-supplied arguments against `schema`; throws a descriptive error otherwise. */
export function parseIpcArgs<S extends z.ZodType>(
  channel: IpcChannelName,
  schema: S,
  args: unknown[],
): z.infer<S> {
  const parsed = schema.safeParse(args)
  if (!parsed.success) {
    throw new InvalidIpcArgumentsError(
      channel,
      parsed.error.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`).join('; '),
    )
  }
  return parsed.data
}

/** Registers a handler whose arguments (as a tuple) are validated before the handler runs. */
export function handle<S extends z.ZodType<unknown[]>, R>(
  channel: IpcChannelName,
  argsSchema: S,
  handler: (args: z.infer<S>) => R,
): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]) =>
    handler(parseIpcArgs(channel, argsSchema, args)),
  )
}
