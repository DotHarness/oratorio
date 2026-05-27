import { describe, expect, it } from 'vitest'
import {
  resolveWindowCloseBehavior,
  shouldHideWindowOnClose,
} from './windowCloseBehavior'

describe('window close behavior helpers', () => {
  it('uses minimize to tray as the default close behavior', () => {
    expect(resolveWindowCloseBehavior({})).toBe('minimizeToTray')
  })

  it('falls back to minimize to tray for unsupported preference values', () => {
    expect(resolveWindowCloseBehavior({ closeBehavior: 'closeToNowhere' })).toBe('minimizeToTray')
  })

  it('does not hide the window while the app is quitting', () => {
    expect(shouldHideWindowOnClose({
      closeBehavior: 'minimizeToTray',
      hasTray: true,
      isQuitting: true,
    })).toBe(false)
  })

  it('does not hide the window when quit app is selected', () => {
    expect(shouldHideWindowOnClose({
      closeBehavior: 'quitApp',
      hasTray: true,
      isQuitting: false,
    })).toBe(false)
  })

  it('does not hide the window when no tray icon is available', () => {
    expect(shouldHideWindowOnClose({
      closeBehavior: 'minimizeToTray',
      hasTray: false,
      isQuitting: false,
    })).toBe(false)
  })

  it('hides the window only when minimize to tray is active and a tray icon exists', () => {
    expect(shouldHideWindowOnClose({
      closeBehavior: 'minimizeToTray',
      hasTray: true,
      isQuitting: false,
    })).toBe(true)
  })
})
