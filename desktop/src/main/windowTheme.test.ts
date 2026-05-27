import type { BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyWindowBackdropTheme, resolveWindowBackdropOptions } from './windowTheme'

const mainDir = dirname(fileURLToPath(import.meta.url))

describe('window backdrop theme helpers', () => {
  it('uses native acrylic with Windows-owned rounded corners', () => {
    expect(resolveWindowBackdropOptions('dark', 'win32')).toMatchObject({
      backgroundColor: '#101317',
      backgroundMaterial: 'acrylic',
      roundedCorners: true,
      transparent: false
    })

    expect(resolveWindowBackdropOptions('light', 'win32')).toMatchObject({
      backgroundColor: '#f7f9fc',
      backgroundMaterial: 'acrylic',
      roundedCorners: true,
      transparent: false
    })
  })

  it('uses sidebar vibrancy over a transparent base on macOS', () => {
    expect(resolveWindowBackdropOptions('dark', 'darwin')).toMatchObject({
      backgroundColor: '#00000000',
      roundedCorners: true,
      transparent: true,
      vibrancy: 'sidebar',
      visualEffectState: 'active'
    })
  })

  it('uses theme-colored solid fallbacks on Linux', () => {
    expect(resolveWindowBackdropOptions('dark', 'linux')).toMatchObject({
      backgroundColor: '#101317',
      transparent: false
    })

    expect(resolveWindowBackdropOptions('light', 'linux')).toMatchObject({
      backgroundColor: '#f7f9fc',
      transparent: false
    })
  })

  it('applies runtime Windows background material changes', () => {
    const calls: string[] = []
    const win = fakeWindow({
      setBackgroundColor: (color) => calls.push(`color:${color}`),
      setBackgroundMaterial: (material) => calls.push(`material:${material}`)
    })

    applyWindowBackdropTheme(win, 'dark', 'win32')

    expect(calls).toEqual(['color:#101317', 'material:acrylic'])
  })

  it('applies runtime macOS vibrancy changes', () => {
    const calls: string[] = []
    const win = fakeWindow({
      setBackgroundColor: (color) => calls.push(`color:${color}`),
      setVibrancy: (type) => calls.push(`vibrancy:${type}`)
    })

    applyWindowBackdropTheme(win, 'light', 'darwin')

    expect(calls).toEqual(['color:#00000000', 'vibrancy:sidebar'])
  })

  it('syncs desktop:set-theme with the active window backdrop', () => {
    const mainSource = readFileSync(resolve(mainDir, 'index.ts'), 'utf8')

    expect(mainSource).toContain("import { applyWindowBackdropTheme, resolveWindowBackdropOptions } from './windowTheme'")
    expect(mainSource).toContain('...resolveWindowBackdropOptions(theme)')
    expect(mainSource).toContain("ipcMain.handle('desktop:set-theme', (event, theme: DesktopTheme)")
    expect(mainSource).toContain('const win = getEventWindow(event)')
    expect(mainSource).toContain('applyWindowBackdropTheme(win, theme)')
  })
})

function fakeWindow(overrides: Partial<{
  setBackgroundColor(color: string): void
  setBackgroundMaterial(material: 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed'): void
  setVibrancy(type: 'sidebar' | null): void
}>): BrowserWindow {
  return {
    setBackgroundColor: () => undefined,
    setBackgroundMaterial: () => undefined,
    setVibrancy: () => undefined,
    ...overrides
  } as unknown as BrowserWindow
}
