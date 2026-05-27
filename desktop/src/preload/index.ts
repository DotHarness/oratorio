import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { OratorioServerStatus } from '../main/OratorioServerManager'
import type { OratorioWindowState } from '../main/windowChrome'

export interface OratorioDesktopStatus {
  appVersion: string
  platform: NodeJS.Platform
  server: OratorioServerStatus | null
}

export type OratorioDesktopUnsubscribe = () => void
export type OratorioDesktopTheme = 'dark' | 'light'
export type OratorioDesktopWindowCloseBehavior = 'minimizeToTray' | 'quitApp'

let appBindingCallback: ((url: string) => void) | null = null
const pendingAppBindingUrls: string[] = []

ipcRenderer.on('desktop:app-binding-handoff', (_event: IpcRendererEvent, url: string) => {
  if (appBindingCallback) {
    appBindingCallback(url)
    return
  }

  pendingAppBindingUrls.push(url)
})

const api = {
  getStatus(): Promise<OratorioDesktopStatus> {
    return ipcRenderer.invoke('desktop:get-status')
  },
  restartServer(): Promise<OratorioServerStatus> {
    return ipcRenderer.invoke('desktop:restart-server')
  },
  openExternal(url: string): Promise<void> {
    return ipcRenderer.invoke('desktop:open-external', url)
  },
  selectDirectory(defaultPath?: string): Promise<string | null> {
    return ipcRenderer.invoke('desktop:select-directory', defaultPath)
  },
  getTheme(): Promise<OratorioDesktopTheme | null> {
    return ipcRenderer.invoke('desktop:get-theme')
  },
  setTheme(theme: OratorioDesktopTheme): Promise<void> {
    return ipcRenderer.invoke('desktop:set-theme', theme)
  },
  getWindowCloseBehavior(): Promise<OratorioDesktopWindowCloseBehavior> {
    return ipcRenderer.invoke('desktop:get-window-close-behavior')
  },
  setWindowCloseBehavior(closeBehavior: OratorioDesktopWindowCloseBehavior): Promise<void> {
    return ipcRenderer.invoke('desktop:set-window-close-behavior', closeBehavior)
  },
  minimizeWindow(): Promise<void> {
    return ipcRenderer.invoke('desktop:minimize-window')
  },
  toggleMaximizeWindow(): Promise<OratorioWindowState | null> {
    return ipcRenderer.invoke('desktop:toggle-maximize-window')
  },
  closeWindow(): Promise<void> {
    return ipcRenderer.invoke('desktop:close-window')
  },
  getWindowState(): Promise<OratorioWindowState | null> {
    return ipcRenderer.invoke('desktop:get-window-state')
  },
  onWindowStateChanged(callback: (state: OratorioWindowState) => void): OratorioDesktopUnsubscribe {
    const listener = (_event: IpcRendererEvent, state: OratorioWindowState) => callback(state)
    ipcRenderer.on('desktop:window-state-changed', listener)
    return () => ipcRenderer.removeListener('desktop:window-state-changed', listener)
  },
  onServerStatusChanged(callback: (status: OratorioServerStatus) => void): OratorioDesktopUnsubscribe {
    const listener = (_event: IpcRendererEvent, status: OratorioServerStatus) => callback(status)
    ipcRenderer.on('desktop:server-status-changed', listener)
    return () => ipcRenderer.removeListener('desktop:server-status-changed', listener)
  },
  async onAppBindingHandoff(callback: (url: string) => void): Promise<OratorioDesktopUnsubscribe> {
    appBindingCallback = callback
    const fromMain = await ipcRenderer.invoke('desktop:get-pending-app-binding-urls') as string[]
    pendingAppBindingUrls.push(...fromMain)
    while (pendingAppBindingUrls.length > 0) {
      const next = pendingAppBindingUrls.shift()
      if (next) callback(next)
    }

    return () => {
      if (appBindingCallback === callback) {
        appBindingCallback = null
      }
    }
  },
  goBack(): Promise<OratorioWindowState | null> {
    return ipcRenderer.invoke('desktop:go-back')
  },
  goForward(): Promise<OratorioWindowState | null> {
    return ipcRenderer.invoke('desktop:go-forward')
  },
  reload(): Promise<void> {
    return ipcRenderer.invoke('desktop:reload')
  },
  forceReload(): Promise<void> {
    return ipcRenderer.invoke('desktop:force-reload')
  },
  toggleDevTools(): Promise<void> {
    return ipcRenderer.invoke('desktop:toggle-devtools')
  },
  resetZoom(): Promise<void> {
    return ipcRenderer.invoke('desktop:reset-zoom')
  },
  zoomIn(): Promise<void> {
    return ipcRenderer.invoke('desktop:zoom-in')
  },
  zoomOut(): Promise<void> {
    return ipcRenderer.invoke('desktop:zoom-out')
  },
  toggleFullScreen(): Promise<OratorioWindowState | null> {
    return ipcRenderer.invoke('desktop:toggle-full-screen')
  }
}

contextBridge.exposeInMainWorld('oratorioDesktop', api)

export type OratorioDesktopApi = typeof api
