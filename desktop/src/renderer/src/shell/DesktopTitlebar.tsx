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
  Settings,
  Square,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '../components/primitives/Tooltip'
import type { DotCraftAppBindingStatusResponse } from '../lib/types'
import type {
  LocalSshConfigInfo,
  OratorioServerConnectionPreferences,
  OratorioServerStatus,
} from '../../../shared/desktopConnection'

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
  serverConnection: OratorioServerConnectionPreferences
}

type OratorioDesktopServerConnectionUpdateResult = {
  preferences: OratorioServerConnectionPreferences
  status: OratorioServerStatus
}

type OratorioDesktopTheme = 'dark' | 'light'
type OratorioDesktopWindowCloseBehavior = 'minimizeToTray' | 'quitApp'

type OratorioDesktopApi = {
  getStatus(): Promise<OratorioDesktopStatus>
  restartServer(): Promise<OratorioServerStatus>
  getServerConnectionPreferences(): Promise<OratorioServerConnectionPreferences>
  getLocalSshConfig(): Promise<LocalSshConfigInfo>
  setServerConnectionPreferences(preferences: OratorioServerConnectionPreferences): Promise<OratorioDesktopServerConnectionUpdateResult>
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

export function DesktopTitlebar({ dotCraftAppBindingStatus = null, dotcraftIconSrc }: DesktopTitlebarProps = {}) {
  const { t } = useTranslation('common')
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
  const backendKind = serverStatus?.backendKind ?? 'managedLocal'
  const isRemoteBackend = backendKind === 'remote' || serverStatus?.serverMode === 'remote'
  const serverLabel = t(`titlebar.serverState.${serverState}`)
  const backendLabel = backendKind === 'remote' && serverStatus?.remoteTransport === 'sshTunnel'
    ? t('titlebar.backendKind.remoteTunnel')
    : t(`titlebar.backendKind.${backendKind}`)
  const serverTitle = serverStatus?.errorMessage
    ? t('titlebar.serverErrorTitle', { label: backendLabel, message: serverStatus.errorMessage })
    : t('titlebar.serverTitle', { label: backendLabel, state: serverLabel.toLowerCase() })
  const maximizeLabel = windowState.isMaximized ? t('titlebar.restoreWindow') : t('titlebar.maximizeWindow')
  const dotCraftTooltip = dotCraftAppBindingStatus?.connected
    ? dotCraftConnectionTooltip(dotCraftAppBindingStatus, t)
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

  function openConnectionSettings(): void {
    window.location.hash = '#/settings/general'
  }

  return (
    <div className="desktop-titlebar" role="toolbar" aria-label={t('titlebar.windowControls')}>
      <div className="desktop-titlebar-nav">
        <DesktopTitlebarButton label={t('titlebar.back')} disabled={!windowState.canGoBack} onClick={() => invokeWindowState(() => desktop.goBack())}>
          <ArrowLeft size={15} />
        </DesktopTitlebarButton>
        <DesktopTitlebarButton label={t('titlebar.forward')} disabled={!windowState.canGoForward} onClick={() => invokeWindowState(() => desktop.goForward())}>
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
                <strong>{backendLabel}</strong>
                <small>{serverStatus?.tunnel?.localUrl ?? serverStatus?.serverUrl ?? t('titlebar.localServer')}</small>
              </span>
            </div>
            {serverStatus?.errorMessage ? <p className="desktop-titlebar-menu-error">{serverStatus.errorMessage}</p> : null}
            <DesktopTitlebarMenuItem icon={RotateCw} label={isRemoteBackend ? t('titlebar.reconnectServer') : t('titlebar.restartServer')} onClick={() => invoke(() => desktop.restartServer())} />
            {isRemoteBackend ? <DesktopTitlebarMenuItem icon={Settings} label={t('titlebar.connectionSettings')} onClick={() => invoke(openConnectionSettings)} /> : null}
          </div>
        ) : null}

        <DesktopTitlebarButton
          label={t('titlebar.desktopActions')}
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
            <DesktopTitlebarMenuItem icon={RefreshCw} label={t('titlebar.reload')} onClick={() => invoke(() => desktop.reload())} />
            <DesktopTitlebarMenuItem icon={RotateCw} label={t('titlebar.forceReload')} onClick={() => invoke(() => desktop.forceReload())} />
            <DesktopTitlebarMenuItem icon={Bug} label={t('titlebar.toggleDevTools')} onClick={() => invoke(() => desktop.toggleDevTools())} />
            <DesktopTitlebarMenuSeparator />
            <DesktopTitlebarMenuItem icon={ZoomIn} label={t('titlebar.zoomIn')} onClick={() => invoke(() => desktop.zoomIn())} />
            <DesktopTitlebarMenuItem icon={ZoomOut} label={t('titlebar.zoomOut')} onClick={() => invoke(() => desktop.zoomOut())} />
            <DesktopTitlebarMenuItem icon={Minimize2} label={t('titlebar.resetZoom')} onClick={() => invoke(() => desktop.resetZoom())} />
            <DesktopTitlebarMenuSeparator />
            <DesktopTitlebarMenuItem icon={Fullscreen} label={t('titlebar.toggleFullScreen')} onClick={() => invokeWindowState(() => desktop.toggleFullScreen())} />
          </div>
        ) : null}

        <div className="desktop-window-controls">
          <DesktopTitlebarButton label={t('titlebar.minimizeWindow')} tooltipMode="native" onClick={() => invoke(() => desktop.minimizeWindow())}>
            <Minus size={15} />
          </DesktopTitlebarButton>
          <DesktopTitlebarButton label={maximizeLabel} tooltipMode="native" onClick={() => invokeWindowState(() => desktop.toggleMaximizeWindow())}>
            {windowState.isMaximized ? <Minimize2 size={14} /> : <Square size={13} />}
          </DesktopTitlebarButton>
          <DesktopTitlebarButton label={t('titlebar.closeWindow')} className="desktop-window-close" tooltipMode="native" onClick={() => invoke(() => desktop.closeWindow())}>
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

function dotCraftConnectionTooltip(status: DotCraftAppBindingStatusResponse, t: (key: string, options?: Record<string, unknown>) => string): string {
  const details = [status.accountLabel, status.workspacePath].filter(Boolean)
  return details.length > 0
    ? t('titlebar.connectedTo', { details: details.join(' · ') })
    : t('titlebar.connected')
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
