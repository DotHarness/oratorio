export interface OratorioWindowState {
  isMaximized: boolean
  isFullScreen: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface WindowStateSource {
  isMaximized(): boolean
  isFullScreen(): boolean
  webContents: {
    navigationHistory: NavigationHistorySource
  }
}

export interface NavigationHistorySource {
  canGoBack(): boolean
  canGoForward(): boolean
  clear(): void
  goBack(): void
  goForward(): void
}

export interface WindowNavigationSource {
  webContents: {
    navigationHistory: NavigationHistorySource
  }
}

export function snapshotWindowState(win: WindowStateSource): OratorioWindowState {
  const history = win.webContents.navigationHistory
  return {
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
    canGoBack: history.canGoBack(),
    canGoForward: history.canGoForward()
  }
}

export function clearNavigationHistoryAfterShellSwap(win: WindowNavigationSource): void {
  win.webContents.navigationHistory.clear()
}

export function navigateBack(win: WindowNavigationSource): void {
  const history = win.webContents.navigationHistory
  if (history.canGoBack()) {
    history.goBack()
  }
}

export function navigateForward(win: WindowNavigationSource): void {
  const history = win.webContents.navigationHistory
  if (history.canGoForward()) {
    history.goForward()
  }
}

export function nextZoomLevel(current: number, direction: 'in' | 'out'): number {
  const delta = direction === 'in' ? 0.5 : -0.5
  return clampZoomLevel(current + delta)
}

export function clampZoomLevel(value: number): number {
  return Math.max(-8, Math.min(8, value))
}
