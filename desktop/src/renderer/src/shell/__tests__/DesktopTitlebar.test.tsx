import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopTitlebar } from '../DesktopTitlebar'

describe('DesktopTitlebar', () => {
  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: undefined })
  })

  it('renders direct window control buttons and invokes the desktop API', async () => {
    const desktop = makeDesktopApi()
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: desktop })

    render(<DesktopTitlebar />)

    await waitFor(() => expect(desktop.getWindowState).toHaveBeenCalled())

    const minimize = screen.getByRole('button', { name: 'Minimize window' })
    const maximize = screen.getByRole('button', { name: 'Maximize window' })
    const close = screen.getByRole('button', { name: 'Close window' })
    expect(minimize.parentElement).toHaveClass('desktop-window-controls')
    expect(close.parentElement).toHaveClass('desktop-window-controls')
    expect(minimize).toHaveAttribute('title', 'Minimize window')
    expect(maximize).toHaveAttribute('title', 'Maximize window')
    expect(close).toHaveAttribute('title', 'Close window')

    fireEvent.pointerEnter(minimize)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.click(minimize)
    fireEvent.click(close)

    expect(desktop.minimizeWindow).toHaveBeenCalledOnce()
    expect(desktop.closeWindow).toHaveBeenCalledOnce()
  })

  it('shows themed tooltips without wrapping titlebar buttons', () => {
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: makeDesktopApi() })

    render(<DesktopTitlebar />)

    const more = screen.getByRole('button', { name: 'Desktop actions' })
    expect(more.parentElement).toHaveClass('desktop-titlebar-actions')

    fireEvent.pointerEnter(more)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Desktop actions')
  })

  it('shows the DotCraft connected app indicator when the app connection is connected', () => {
    Object.defineProperty(window, 'oratorioDesktop', { configurable: true, value: makeDesktopApi() })

    render(<DesktopTitlebar
      dotcraftIconSrc="/dotcraft-icon.svg"
      dotCraftAppBindingStatus={{
        appId: 'com.dotharness.oratorio',
        available: true,
        configured: true,
        connected: true,
        state: 'connected',
        workspacePath: 'F:\\dotcraft',
        endpoint: 'ws://127.0.0.1:9100/ws',
        endpointSource: 'hub',
        accountLabel: 'Kai',
        connectedAt: '2026-05-17T08:00:00Z',
        expiresAt: null,
        diagnostic: null,
        message: 'DotCraft is connected to Oratorio.',
      }}
    />)

    const indicator = screen.getByRole('img', { name: /Connected to DotCraft/ })
    expect(indicator).toBeInTheDocument()

    fireEvent.pointerEnter(indicator)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Kai')
    expect(screen.getByRole('tooltip')).toHaveTextContent('F:\\dotcraft')
  })
})

function makeDesktopApi() {
  const windowState = {
    isMaximized: false,
    isFullScreen: false,
    canGoBack: false,
    canGoForward: false,
  }

  return {
    getStatus: vi.fn(async () => ({ appVersion: 'test', platform: 'win32', server: null })),
    restartServer: vi.fn(async () => ({
      state: 'running',
      serverUrl: 'http://127.0.0.1:5087',
      reusedExistingServer: true,
      pid: null,
      errorMessage: null,
    })),
    getTheme: vi.fn(async () => null),
    setTheme: vi.fn(async () => undefined),
    getWindowCloseBehavior: vi.fn(async () => 'minimizeToTray' as const),
    setWindowCloseBehavior: vi.fn(async () => undefined),
    minimizeWindow: vi.fn(async () => undefined),
    toggleMaximizeWindow: vi.fn(async () => windowState),
    closeWindow: vi.fn(async () => undefined),
    getWindowState: vi.fn(async () => windowState),
    onWindowStateChanged: vi.fn(() => vi.fn()),
    onServerStatusChanged: vi.fn(() => vi.fn()),
    goBack: vi.fn(async () => windowState),
    goForward: vi.fn(async () => windowState),
    reload: vi.fn(async () => undefined),
    forceReload: vi.fn(async () => undefined),
    toggleDevTools: vi.fn(async () => undefined),
    resetZoom: vi.fn(async () => undefined),
    zoomIn: vi.fn(async () => undefined),
    zoomOut: vi.fn(async () => undefined),
    toggleFullScreen: vi.fn(async () => windowState),
  }
}
