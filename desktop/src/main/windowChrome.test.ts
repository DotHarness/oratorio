import { describe, expect, it } from 'vitest'
import {
  clampZoomLevel,
  clearNavigationHistoryAfterShellSwap,
  navigateBack,
  navigateForward,
  nextZoomLevel,
  snapshotWindowState,
  type NavigationHistorySource,
  type WindowNavigationSource,
  type WindowStateSource
} from './windowChrome'

function fakeWindow(options: {
  isMaximized?: boolean
  isFullScreen?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
}): WindowStateSource {
  const history = fakeHistory({
    canGoBack: () => options.canGoBack ?? false,
    canGoForward: () => options.canGoForward ?? false
  })
  return {
    isMaximized: () => options.isMaximized ?? false,
    isFullScreen: () => options.isFullScreen ?? false,
    webContents: {
      navigationHistory: history
    }
  }
}

describe('window chrome helpers', () => {
  it('projects only the renderer-safe window state fields from navigation history', () => {
    expect(snapshotWindowState(fakeWindow({
      isMaximized: true,
      isFullScreen: false,
      canGoBack: true,
      canGoForward: false
    }))).toEqual({
      isMaximized: true,
      isFullScreen: false,
      canGoBack: true,
      canGoForward: false
    })
  })

  it('clears shell swap history after temporary desktop pages are replaced', () => {
    const clearCalls: string[] = []
    const win = fakeNavigationWindow({
      clear: () => clearCalls.push('clear')
    })

    clearNavigationHistoryAfterShellSwap(win)

    expect(clearCalls).toEqual(['clear'])
  })

  it('navigates back and forward through navigationHistory only when available', () => {
    const backCalls: string[] = []
    const forwardCalls: string[] = []
    const win = fakeNavigationWindow({
      canGoBack: () => true,
      canGoForward: () => true,
      goBack: () => backCalls.push('back'),
      goForward: () => forwardCalls.push('forward')
    })

    navigateBack(win)
    navigateForward(win)

    expect(backCalls).toEqual(['back'])
    expect(forwardCalls).toEqual(['forward'])
  })

  it('does not navigate when history has no matching entry', () => {
    const backCalls: string[] = []
    const forwardCalls: string[] = []
    const win = fakeNavigationWindow({
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: () => backCalls.push('back'),
      goForward: () => forwardCalls.push('forward')
    })

    navigateBack(win)
    navigateForward(win)

    expect(backCalls).toEqual([])
    expect(forwardCalls).toEqual([])
  })

  it('uses bounded zoom steps for desktop zoom controls', () => {
    expect(nextZoomLevel(0, 'in')).toBe(0.5)
    expect(nextZoomLevel(0, 'out')).toBe(-0.5)
    expect(clampZoomLevel(20)).toBe(8)
    expect(clampZoomLevel(-20)).toBe(-8)
  })
})

function fakeNavigationWindow(historyOverrides: Partial<NavigationHistorySource> = {}): WindowNavigationSource {
  return {
    webContents: {
      navigationHistory: fakeHistory(historyOverrides)
    }
  }
}

function fakeHistory(overrides: Partial<NavigationHistorySource> = {}): NavigationHistorySource {
  return {
    canGoBack: () => false,
    canGoForward: () => false,
    clear: () => undefined,
    goBack: () => undefined,
    goForward: () => undefined,
    ...overrides
  }
}
