import { _electron as electron, expect, test } from '@playwright/test'
import { join } from 'node:path'

test('app launches with an isolated renderer and a working bridge', async () => {
  const app = await electron.launch({ args: [join(__dirname, '../../out/main/index.js')] })
  try {
    const page = await app.firstWindow()

    const globals = await page.evaluate(() => {
      const g = globalThis as Record<string, unknown>
      return {
        require: typeof g['require'],
        process: typeof g['process'],
        frame: typeof g['frame'],
      }
    })
    expect(globals).toEqual({ require: 'undefined', process: 'undefined', frame: 'object' })

    await expect(page.getByTestId('app-info')).toContainText('Electron')
  } finally {
    await app.close()
  }
})
