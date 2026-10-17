import koffi from 'koffi'

/** mpv's window class when embedded with --wid. */
export const MPV_WINDOW_CLASS = 'mpv'

const HWND_TOP = 0
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010

interface User32 {
  findWindowEx: (parent: number, childAfter: number, className: string, title: null) => number
  setWindowPos: (
    hwnd: number,
    insertAfter: number,
    x: number,
    y: number,
    cx: number,
    cy: number,
    flags: number,
  ) => number
}

let user32: User32 | null = null

function loadUser32(): User32 {
  if (!user32) {
    const lib = koffi.load('user32.dll')
    user32 = {
      findWindowEx: lib.func(
        'intptr_t __stdcall FindWindowExW(intptr_t hWndParent, intptr_t hWndChildAfter, const char16_t *lpszClass, const char16_t *lpszWindow)',
      ),
      setWindowPos: lib.func(
        'int __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)',
      ),
    }
  }
  return user32
}

/**
 * Every Electron window gets a Chromium GPU compositor child window ("Intermediate D3D Window")
 * that sits above other children. mpv's video child window must be raised above it to be seen.
 * Returns false when mpv's window does not exist yet. No-op outside Windows.
 */
export function raiseVideoWindow(hostHwnd: number): boolean {
  if (process.platform !== 'win32') return true
  const api = loadUser32()
  const child = api.findWindowEx(hostHwnd, 0, MPV_WINDOW_CLASS, null)
  if (!child) return false
  return (
    api.setWindowPos(child, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE) !== 0
  )
}
