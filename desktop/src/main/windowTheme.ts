import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

export type OratorioWindowTheme = 'dark' | 'light'

type WindowBackdropOptions = Pick<
  BrowserWindowConstructorOptions,
  'backgroundColor' | 'backgroundMaterial' | 'transparent' | 'visualEffectState' | 'roundedCorners'
> & {
  vibrancy?: Exclude<Parameters<BrowserWindow['setVibrancy']>[0], null>
}

const transparentWindowBackground = '#00000000'

export const windowFallbackBackgroundByTheme: Record<OratorioWindowTheme, string> = {
  dark: '#101317',
  light: '#f7f9fc'
}

export function resolveWindowBackdropOptions(
  theme: OratorioWindowTheme,
  platform: NodeJS.Platform = process.platform
): WindowBackdropOptions {
  if (platform === 'win32') {
    return {
      backgroundColor: windowFallbackBackgroundByTheme[theme],
      backgroundMaterial: 'acrylic',
      roundedCorners: true,
      transparent: false
    }
  }

  if (platform === 'darwin') {
    return {
      backgroundColor: transparentWindowBackground,
      roundedCorners: true,
      transparent: true,
      vibrancy: 'sidebar',
      visualEffectState: 'active'
    }
  }

  return {
    backgroundColor: windowFallbackBackgroundByTheme[theme],
    transparent: false
  }
}

export function applyWindowBackdropTheme(
  win: BrowserWindow,
  theme: OratorioWindowTheme,
  platform: NodeJS.Platform = process.platform
): void {
  const options = resolveWindowBackdropOptions(theme, platform)
  win.setBackgroundColor(options.backgroundColor ?? windowFallbackBackgroundByTheme[theme])

  if (platform === 'win32') {
    try {
      win.setBackgroundMaterial(options.backgroundMaterial ?? 'none')
    } catch {
      win.setBackgroundMaterial('none')
    }
    return
  }

  if (platform === 'darwin') {
    try {
      win.setVibrancy(options.vibrancy ?? null)
    } catch {
      win.setVibrancy(null)
    }
  }
}
