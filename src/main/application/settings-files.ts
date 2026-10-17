import { readFile, stat, writeFile } from 'node:fs/promises'
import { shortcutFileSchema, type ShortcutOverrides } from '@shared/settings/shortcuts'
import {
  MAX_THEME_FILE_BYTES,
  themeFileSchema,
  type Theme,
  type ThemeFile,
} from '@shared/settings/theme'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function parseJson(text: string): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text.replace(/^\uFEFF/, '')) as unknown }
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' }
  }
}

/** Validates a theme file. Only a name and hex colors are accepted; nothing is executed. */
export function parseThemeFile(text: string): ParseResult<ThemeFile> {
  const json = parseJson(text)
  if (!json.ok) return json
  const parsed = themeFileSchema.safeParse(json.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.join('.') || 'file'
    return {
      ok: false,
      error: `Not a valid Frame theme (${where}: ${issue?.message ?? 'invalid'}).`,
    }
  }
  return { ok: true, value: parsed.data }
}

export function parseShortcutFile(text: string): ParseResult<ShortcutOverrides> {
  const json = parseJson(text)
  if (!json.ok) return json
  const parsed = shortcutFileSchema.safeParse(json.value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.join('.') || 'file'
    return {
      ok: false,
      error: `Not a valid Frame shortcut file (${where}: ${issue?.message ?? 'invalid'}).`,
    }
  }
  return { ok: true, value: parsed.data.bindings }
}

export function themeToFile(theme: Theme): string {
  const file: ThemeFile = {
    format: 'frame-theme',
    version: 1,
    name: theme.name,
    colors: theme.colors,
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

export function shortcutsToFile(bindings: ShortcutOverrides): string {
  return `${JSON.stringify({ format: 'frame-shortcuts', version: 1, bindings }, null, 2)}\n`
}

/** Reads a small user-chosen text file, refusing anything large. */
export async function readSmallTextFile(path: string): Promise<ParseResult<string>> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return { ok: false, error: 'Choose a file.' }
    if (info.size > MAX_THEME_FILE_BYTES) return { ok: false, error: 'The file is too large.' }
    return { ok: true, value: await readFile(path, 'utf8') }
  } catch (error) {
    return {
      ok: false,
      error: `Could not read the file (${error instanceof Error ? error.message : String(error)}).`,
    }
  }
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  await writeFile(path, text, 'utf8')
}
