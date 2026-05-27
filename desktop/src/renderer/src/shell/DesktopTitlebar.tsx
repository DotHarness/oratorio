import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Fullscreen,
  Minimize2,
  Minus,
  MoreHorizontal,
  RefreshCw,
  RotateCw,
  Server,
  Square,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { Tooltip } from '../components/primitives/Tooltip'
import type { DotCraftAppBindingStatusResponse } from '../lib/types'

type OratorioServerState = 'stopped' | 'starting' | 'running' | 'error'

type OratorioServerStatus = {
  state: OratorioServerState
  serverUrl: string | null
  reusedExistingServer: boolean
  pid: number | null
  errorMessage: string | null
}

type OratorioWindowState = {
  isMaximized: boolean
  isFullScreen: boolean
  canGoBack: boolean
  canGoForward: boolean
}

type OratorioDesktopStatus = {
  appVersion: string
  platform: string
  server: OratorioServerStatus | null
}

type OratorioDesktopTheme = 'dark' | 'light'
type OratorioDesktopWindowCloseBehavior = 'minimizeToTray' | 'quitApp'

type OratorioDesktopApi = {
  getStatus(): Promise<OratorioDesktopStatus>
  restartServer(): Promise<OratorioServerStatus>
  selectDirectory(defaultPath?: string): Promise<string | null>
  getTheme(): Promise<OratorioDesktopTheme | null>
  setTheme(theme: OratorioDesktopTheme): Promise<void>
  getWindowCloseBehavior(): Promise<OratorioDesktopWindowCloseBehavior>
  setWindowCloseBehavior(closeBehavior: OratorioDesktopWindowCloseBehavior): Promise<void>
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<OratorioWindowState | null>
  closeWindow(): Promise<void>
  getWindowState(): Promise<OratorioWindowState | null>
  onWindowStateChanged(callback: (state: OratorioWindowState) => void): () => void
  onServerStatusChanged(callback: (status: OratorioServerStatus) => void): () => void
  onAppBindingHandoff(callback: (url: string) => void): Promise<() => void>
  goBack(): Promise<OratorioWindowState | null>
  goForward(): Promise<OratorioWindowState | null>
  reload(): Promise<void>
  forceReload(): Promise<void>
  toggleDevTools(): Promise<void>
  resetZoom(): Promise<void>
  zoomIn(): Promise<void>
  zoomOut(): Promise<void>
  toggleFullScreen(): Promise<OratorioWindowState | null>
}

declare global {
  interface Window {
    oratorioDesktop?: OratorioDesktopApi
  }
}

const initialWindowState: OratorioWindowState = {
  isMaximized: false,
  isFullScreen: false,
  canGoBack: false,
  canGoForward: false,
}

type DesktopTitlebarProps = {
  dotCraftAppBindingStatus?: DotCraftAppBindingStatusResponse | null
  dotcraftIconSrc?: string
}

const serverStateLabels: Record<OratorioServerState, string> = {
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  error: 'Error',
}

export function DesktopTitlebar({ dotCraftAppBindingStatus = null, dotcraftIconSrc }: DesktopTitlebarProps = {}) {
  const desktop = window.oratorioDesktop
  const menuRootRef = useRef<HTMLDivElement | null>(null)
  const [windowState, setWindowState] = useState<OratorioWindowState>(initialWindowState)
  const [serverStatus, setServerStatus] = useState<OratorioServerStatus | null>(null)
  const [serverMenuOpen, setServerMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  useEffect(() => {
    if (!desktop) {
      return
    }

    let mounted = true
    void desktop.getStatus().then((status) => {
      if (mounted) {
        setServerStatus(status.server)
      }
    }).catch(() => {})
    void desktop.getWindowState().then((state) => {
      if (mounted && state) {
        setWindowState(state)
      }
    }).catch(() => {})

    const unsubscribeServer = desktop.onServerStatusChanged((status) => setServerStatus(status))
    const unsubscribeWindow = desktop.onWindowStateChanged((state) => setWindowState(state))
    return () => {
      mounted = false
      unsubscribeServer()
      unsubscribeWindow()
    }
  }, [desktop])

  useEffect(() => {
    if (!serverMenuOpen && !moreMenuOpen) {
      return
    }

    const closeMenus = (event: PointerEvent): void => {
      if (menuRootRef.current?.contains(event.target as Node)) {
        return
      }
      setServerMenuOpen(false)
      setMoreMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setServerMenuOpen(false)
        setMoreMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeMenus)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenus)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [moreMenuOpen, serverMenuOpen])

  if (!desktop) {
    return null
  }

  const serverState = serverStatus?.state ?? 'stopped'
  const serverLabel = serverStateLabels[serverState]
  const serverTitle = serverStatus?.errorMessage ? `${serverLabel}: ${serverStatus.errorMessage}` : `Server ${serverLabel.toLowerCase()}`
  const maximizeLabel = windowState.isMaximized ? 'Restore window' : 'Maximize window'
  const dotCraftTooltip = dotCraftAppBindingStatus?.connected
    ? dotCraftConnectionTooltip(dotCraftAppBindingStatus)
    : null

  function invoke(action: () => Promise<unknown> | void): void {
    setServerMenuOpen(false)
    setMoreMenuOpen(false)
    try {
      void Promise.resolve(action()).catch(() => {})
    } catch {
      // Keep titlebar controls resilient even when the target window is gone.
    }
  }

  function invokeWindowState(action: () => Promise<OratorioWindowState | null>): void {
    invoke(async () => {
      const nextState = await action()
      if (nextState) {
        setWindowState(nextState)
      }
    })
  }

  return (
    <div className="desktop-titlebar" role="toolbar" aria-label="Desktop window controls">
      <div className="desktop-titlebar-nav">
        <DesktopTitlebarButton label="Back" disabled={!windowState.canGoBack} onClick={() => invokeWindowState(() => desktop.goBack())}>
          <ArrowLeft size={15} />
        </DesktopTitlebarButton>
        <DesktopTitlebarButton label="Forward" disabled={!windowState.canGoForward} onClick={() => invokeWindowState(() => desktop.goForward())}>
          <ArrowRight size={15} />
        </DesktopTitlebarButton>
      </div>

      <div className="desktop-titlebar-drag-region" aria-hidden="true" />

      <div className="desktop-titlebar-actions" ref={menuRootRef}>
        {dotCraftTooltip ? (
          <DotCraftConnectionIndicator
            iconSrc={dotcraftIconSrc}
            tooltip={dotCraftTooltip}
          />
        ) : null}
        <DesktopTitlebarButton
          label={serverTitle}
          className={`desktop-status-button ${serverState}`}
          active={serverMenuOpen}
          ariaExpanded={serverMenuOpen}
          onClick={() => {
            setMoreMenuOpen(false)
            setServerMenuOpen((open) => !open)
          }}
        >
          <Server size={15} />
          <span className={`desktop-status-dot ${serverState}`} aria-hidden="true" />
        </DesktopTitlebarButton>
        {serverMenuOpen ? (
          <div className="desktop-titlebar-menu desktop-titlebar-menu--server" role="menu">
            <div className="desktop-titlebar-menu-status">
              <span className={`desktop-status-dot ${serverState}`} aria-hidden="true" />
              <span>
                <strong>{serverLabel}</strong>
                <small>{serverStatus?.serverUrl ?? 'Local server'}</small>
              </span>
            </div>
            {serverStatus?.errorMessage ? <p className="desktop-titlebar-menu-error">{serverStatus.errorMessage}</p> : null}
            <DesktopTitlebarMenuItem icon={RotateCw} label="Restart server" onClick={() => invoke(() => desktop.restartServer())} />
          </div>
        ) : null}

        <DesktopTitlebarButton
          label="Desktop actions"
          active={moreMenuOpen}
          ariaExpanded={moreMenuOpen}
          onClick={() => {
            setServerMenuOpen(false)
            setMoreMenuOpen((open) => !open)
          }}
        >
          <MoreHorizontal size={16} />
        </DesktopTitlebarButton>
        {moreMenuOpen ? (
          <div className="desktop-titlebar-menu desktop-titlebar-menu--more" role="menu">
            <DesktopTitlebarMenuItem icon={RefreshCw} label="Reload" onClick={() => invoke(() => desktop.reload())} />
            <DesktopTitlebarMenuItem icon={RotateCw} label="Force reload" onClick={() => invoke(() => desktop.forceReload())} />
            <DesktopTitlebarMenuItem icon={Bug} label="Toggle DevTools" onClick={() => invoke(() => desktop.toggleDevTools())} />
            <DesktopTitlebarMenuSeparator />
            <DesktopTitlebarMenuItem icon={ZoomIn} label="Zoom in" onClick={() => invoke(() => desktop.zoomIn())} />
            <DesktopTitlebarMenuItem icon={ZoomOut} label="Zoom out" onClick={() => invoke(() => desktop.zoomOut())} />
            <DesktopTitlebarMenuItem icon={Minimize2} label="Reset zoom" onClick={() => invoke(() => desktop.resetZoom())} />
            <DesktopTitlebarMenuSeparator />
            <DesktopTitlebarMenuItem icon={Fullscreen} label="Toggle full screen" onClick={() => invokeWindowState(() => desktop.toggleFullScreen())} />
          </div>
        ) : null}

        <div className="desktop-window-controls">
          <DesktopTitlebarButton label="Minimize window" tooltipMode="native" onClick={() => invoke(() => desktop.minimizeWindow())}>
            <Minus size={15} />
          </DesktopTitlebarButton>
          <DesktopTitlebarButton label={maximizeLabel} tooltipMode="native" onClick={() => invokeWindowState(() => desktop.toggleMaximizeWindow())}>
            {windowState.isMaximized ? <Minimize2 size={14} /> : <Square size={13} />}
          </DesktopTitlebarButton>
          <DesktopTitlebarButton label="Close window" className="desktop-window-close" tooltipMode="native" onClick={() => invoke(() => desktop.closeWindow())}>
            <X size={15} />
          </DesktopTitlebarButton>
        </div>
      </div>
    </div>
  )
}

function DotCraftConnectionIndicator({ iconSrc, tooltip }: { iconSrc?: string; tooltip: string }) {
  return (
    <Tooltip content={tooltip}>
      <span className="desktop-dotcraft-status" role="img" tabIndex={0} aria-label={tooltip}>
        {iconSrc ? <img src={iconSrc} alt="" draggable={false} /> : <span className="desktop-dotcraft-fallback">D</span>}
        <span className="desktop-dotcraft-status-dot" aria-hidden="true" />
      </span>
    </Tooltip>
  )
}

function dotCraftConnectionTooltip(status: DotCraftAppBindingStatusResponse): string {
  const details = [status.accountLabel, status.workspacePath].filter(Boolean)
  return details.length > 0
    ? `Connected to DotCraft: ${details.join(' · ')}`
    : 'Connected to DotCraft'
}

function DesktopTitlebarButton({
  active = false,
  ariaExpanded,
  children,
  className = '',
  disabled = false,
  label,
  onClick,
  tooltipMode = 'custom',
}: {
  active?: boolean
  ariaExpanded?: boolean
  children: ReactNode
  className?: string
  disabled?: boolean
  label: string
  onClick: () => void
  tooltipMode?: 'custom' | 'native'
}) {
  const button = (
    <button
      type="button"
      className={`desktop-titlebar-button${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-expanded={ariaExpanded}
      disabled={disabled}
      onClick={onClick}
      title={tooltipMode === 'native' ? label : undefined}
    >
      {children}
    </button>
  )

  return tooltipMode === 'native' ? button : <Tooltip content={label}>{button}</Tooltip>
}

function DesktopTitlebarMenuItem({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" className="desktop-titlebar-menu-item" role="menuitem" onClick={onClick}>
      <Icon size={14} />
      <span>{label}</span>
    </button>
  )
}

function DesktopTitlebarMenuSeparator() {
  return <div className="desktop-titlebar-menu-separator" role="separator" />
}
