export type DesktopStartupTheme = 'dark' | 'light'

export interface StartupThemePreferences {
  theme?: DesktopStartupTheme | null
}

export const defaultStartupTheme: DesktopStartupTheme = 'dark'

export function isDesktopStartupTheme(value: unknown): value is DesktopStartupTheme {
  return value === 'dark' || value === 'light'
}

export function resolveStartupTheme(preferences: StartupThemePreferences | null | undefined): DesktopStartupTheme {
  return isDesktopStartupTheme(preferences?.theme) ? preferences.theme : defaultStartupTheme
}

export function buildRendererStartupQuery(serverUrl: string | null | undefined, theme: DesktopStartupTheme): Record<string, string> {
  return serverUrl ? { serverUrl, theme } : { theme }
}

export function buildRendererStartupUrl(rendererUrl: string, serverUrl: string | null | undefined, theme: DesktopStartupTheme): string {
  const url = new URL(rendererUrl)
  for (const [key, value] of Object.entries(buildRendererStartupQuery(serverUrl, theme))) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}
