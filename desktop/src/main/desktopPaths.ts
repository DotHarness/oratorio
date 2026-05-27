import type { App } from 'electron'
import { join } from 'path'

export type DesktopPathApp = Pick<App, 'getPath'>

export const desktopSettingsDirectoryName = '.oratorio'

export function resolveDesktopSettingsRoot(app: DesktopPathApp): string {
  return join(app.getPath('home'), desktopSettingsDirectoryName)
}

export function resolveDesktopConfigPath(app: DesktopPathApp): string {
  return join(resolveDesktopSettingsRoot(app), 'config.json')
}

export function resolveDesktopPreferencesPath(app: DesktopPathApp): string {
  return join(resolveDesktopSettingsRoot(app), 'preferences.json')
}
