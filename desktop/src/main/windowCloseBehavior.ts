export type OratorioWindowCloseBehavior = 'minimizeToTray' | 'quitApp'

export const defaultWindowCloseBehavior: OratorioWindowCloseBehavior = 'minimizeToTray'

export function resolveWindowCloseBehavior(preferences: { closeBehavior?: unknown }): OratorioWindowCloseBehavior {
  return preferences.closeBehavior === 'quitApp' ? 'quitApp' : defaultWindowCloseBehavior
}

export function shouldHideWindowOnClose(options: {
  closeBehavior: OratorioWindowCloseBehavior
  hasTray: boolean
  isQuitting: boolean
}): boolean {
  return options.closeBehavior === 'minimizeToTray' && options.hasTray && !options.isQuitting
}
