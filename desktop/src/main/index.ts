import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import {
  OratorioServerManager,
  normalizeRemoteServerUrl,
  type OratorioServerConnectionPreferences,
  type OratorioServerStatus
} from './OratorioServerManager'
import { appBindingProtocol, canDeliverAppBindingHandoff, extractAppBindingUrls, shouldActivateWindowForAppBindingUrls } from './appBindingActivation'
import { resolveDesktopPreferencesPath, resolveDesktopSettingsRoot } from './desktopPaths'
import { inspectLocalSshConfig } from './localSshConfig'
import { buildRendererStartupQuery, buildRendererStartupUrl, resolveStartupTheme } from './startupTheme'
import { buildStatusPageHtml, svgToDataUri, type StatusPageTheme } from './statusPage'
import {
  resolveWindowCloseBehavior,
  shouldHideWindowOnClose,
  type OratorioWindowCloseBehavior
} from './windowCloseBehavior'
import {
  clearNavigationHistoryAfterShellSwap,
  navigateBack,
  navigateForward,
  nextZoomLevel,
  snapshotWindowState,
  type OratorioWindowState
} from './windowChrome'
import { applyWindowBackdropTheme, resolveWindowBackdropOptions } from './windowTheme'
import {
  DEFAULT_CONNECTION_PREFERENCES,
  isValidSshTarget,
  normalizeSshTunnelPreferences,
  type OratorioRemoteTransport,
  type OratorioSshTunnelPreferences
} from '../shared/desktopConnection'

let mainWindow: BrowserWindow | null = null
let serverManager: OratorioServerManager | null = null
let tray: Tray | null = null
let isQuitting = false
let ipcRegistered = false
const appUserModelId = 'com.oratorio.desktop'
let pendingAppBindingUrls: string[] = []
type DesktopTheme = StatusPageTheme
type DesktopPreferences = {
  theme?: DesktopTheme
  closeBehavior?: OratorioWindowCloseBehavior
  serverMode?: OratorioServerConnectionPreferences['serverMode']
  remoteServerUrl?: string | null
  remoteTransport?: OratorioRemoteTransport
  sshTunnel?: Partial<OratorioSshTunnelPreferences> | null
}

app.setName('Oratorio')
if (process.platform === 'win32') {
  app.setAppUserModelId(appUserModelId)
}
registerProtocolClient()

function createWindow(theme: DesktopTheme = getStartupTheme()): BrowserWindow {
  const appIcon = resolveAppIcon()
  const win = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    ...resolveWindowBackdropOptions(theme),
    frame: false,
    autoHideMenuBar: true,
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setTitle('Oratorio')
  if (appIcon) {
    win.setIcon(appIcon)
  }
  wireWindowStateEvents(win)
  win.on('close', (event) => {
    if (shouldHideWindowOnClose({
      closeBehavior: getWindowCloseBehavior(),
      hasTray: Boolean(tray && !tray.isDestroyed()),
      isQuitting
    })) {
      event.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (!isSameOrigin(current, url) && isHttpUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  return win
}

async function boot(): Promise<void> {
  Menu.setApplicationMenu(null)
  ensureTray()
  serverManager = new OratorioServerManager({
    app,
    resourcesPath: process.resourcesPath,
    getConnectionPreferences: getServerConnectionPreferences
  })
  serverManager.on('status', (status) => sendServerStatus(status))
  registerIpc()

  const startupTheme = getStartupTheme()
  const win = createWindow(startupTheme)
  mainWindow = win
  const serverStartup = serverManager.ensureStarted()
    .then((status) => ({ status, error: null }))
    .catch((error: unknown) => ({ status: null, error }))

  try {
    await loadRenderer(win, null, startupTheme)
    clearNavigationHistoryAfterShellSwap(win)
    sendWindowState(win)
  } catch (error) {
    await loadStatusPage(
      win,
      'Oratorio could not start',
      error instanceof Error ? error.message : String(error),
      startupTheme
    )
    clearNavigationHistoryAfterShellSwap(win)
    sendWindowState(win)
    return
  }

  const startupResult = await serverStartup
  if (startupResult.status?.serverUrl) {
    sendServerStatus(startupResult.status)
    flushPendingAppBindingUrls(win)
  } else if (startupResult.error) {
    sendServerStatus(serverManager.getStatus())
  }
}

function registerIpc(): void {
  if (ipcRegistered) {
    return
  }

  ipcRegistered = true
  ipcMain.handle('desktop:get-status', () => ({
    appVersion: app.getVersion(),
    platform: process.platform,
    server: serverManager?.getStatus() ?? null,
    serverConnection: getServerConnectionPreferences()
  }))
  ipcMain.handle('desktop:get-server-connection-preferences', () => getServerConnectionPreferences())
  ipcMain.handle('desktop:get-local-ssh-config', () => inspectLocalSshConfig())
  ipcMain.handle('desktop:set-server-connection-preferences', async (_event, draft: Partial<OratorioServerConnectionPreferences>) => {
    if (!serverManager) {
      throw new Error('Server manager is not ready.')
    }

    const connection = normalizeServerConnectionDraft(draft)
    writeDesktopPreferences({ ...readDesktopPreferences(), ...connection })
    let status: OratorioServerStatus
    try {
      status = await serverManager.restart()
    } catch {
      status = serverManager.getStatus()
    }
    flushPendingAppBindingUrls(mainWindow)
    return { preferences: connection, status }
  })
  ipcMain.handle('desktop:restart-server', async () => {
    if (!serverManager) {
      throw new Error('Server manager is not ready.')
    }

    const status = await serverManager.restart()
    flushPendingAppBindingUrls(mainWindow)
    return status
  })
  ipcMain.handle('desktop:open-external', async (_event, url: string) => {
    if (!isHttpUrl(url)) {
      throw new Error('Only http and https URLs can be opened externally.')
    }
    await shell.openExternal(url)
  })
  ipcMain.handle('desktop:get-pending-app-binding-urls', () => {
    const status = serverManager?.getStatus()
    const urls = pendingAppBindingUrls.filter((url) => canDeliverAppBindingHandoff(url, status))
    pendingAppBindingUrls = pendingAppBindingUrls.filter((url) => !canDeliverAppBindingHandoff(url, status))
    return urls
  })
  ipcMain.handle('desktop:select-directory', async (event, defaultPath?: string) => {
    const win = getEventWindow(event)
    const options: OpenDialogOptions = {
      title: 'Select DotCraft workspace',
      defaultPath: typeof defaultPath === 'string' && defaultPath.trim() ? defaultPath : undefined,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('desktop:get-theme', () => {
    return readDesktopPreferences().theme ?? null
  })
  ipcMain.handle('desktop:set-theme', (event, theme: DesktopTheme) => {
    if (theme !== 'dark' && theme !== 'light') {
      throw new Error('Unsupported theme preference.')
    }

    writeDesktopPreferences({ ...readDesktopPreferences(), theme })
    const win = getEventWindow(event)
    if (win && !win.isDestroyed()) {
      applyWindowBackdropTheme(win, theme)
    }
  })
  ipcMain.handle('desktop:get-window-close-behavior', () => {
    return getWindowCloseBehavior()
  })
  ipcMain.handle('desktop:set-window-close-behavior', (_event, closeBehavior: OratorioWindowCloseBehavior) => {
    if (closeBehavior !== 'minimizeToTray' && closeBehavior !== 'quitApp') {
      throw new Error('Unsupported window close behavior preference.')
    }

    writeDesktopPreferences({ ...readDesktopPreferences(), closeBehavior })
  })
  ipcMain.handle('desktop:get-window-state', (event) => getWindowState(getEventWindow(event)))
  ipcMain.handle('desktop:minimize-window', (event) => {
    getEventWindow(event)?.minimize()
  })
  ipcMain.handle('desktop:toggle-maximize-window', (event) => {
    const win = getEventWindow(event)
    if (!win) {
      return null
    }

    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return getWindowState(win)
  })
  ipcMain.handle('desktop:close-window', (event) => {
    getEventWindow(event)?.close()
  })
  ipcMain.handle('desktop:go-back', (event) => {
    const win = getEventWindow(event)
    if (win) {
      navigateBack(win)
    }
    return win ? getWindowState(win) : null
  })
  ipcMain.handle('desktop:go-forward', (event) => {
    const win = getEventWindow(event)
    if (win) {
      navigateForward(win)
    }
    return win ? getWindowState(win) : null
  })
  ipcMain.handle('desktop:reload', (event) => {
    getEventWindow(event)?.webContents.reload()
  })
  ipcMain.handle('desktop:force-reload', (event) => {
    getEventWindow(event)?.webContents.reloadIgnoringCache()
  })
  ipcMain.handle('desktop:toggle-devtools', (event) => {
    const contents = getEventWindow(event)?.webContents
    if (contents?.isDevToolsOpened()) {
      contents.closeDevTools()
    } else {
      contents?.openDevTools({ mode: 'detach' })
    }
  })
  ipcMain.handle('desktop:reset-zoom', (event) => {
    getEventWindow(event)?.webContents.setZoomLevel(0)
  })
  ipcMain.handle('desktop:zoom-in', (event) => {
    const contents = getEventWindow(event)?.webContents
    if (contents) {
      contents.setZoomLevel(nextZoomLevel(contents.getZoomLevel(), 'in'))
    }
  })
  ipcMain.handle('desktop:zoom-out', (event) => {
    const contents = getEventWindow(event)?.webContents
    if (contents) {
      contents.setZoomLevel(nextZoomLevel(contents.getZoomLevel(), 'out'))
    }
  })
  ipcMain.handle('desktop:toggle-full-screen', (event) => {
    const win = getEventWindow(event)
    if (!win) {
      return null
    }

    win.setFullScreen(!win.isFullScreen())
    return getWindowState(win)
  })
}

function wireWindowStateEvents(win: BrowserWindow): void {
  const sendState = (): void => sendWindowState(win)
  win.on('maximize', sendState)
  win.on('unmaximize', sendState)
  win.on('enter-full-screen', sendState)
  win.on('leave-full-screen', sendState)
  win.webContents.on('did-finish-load', sendState)
  win.webContents.on('did-navigate', sendState)
  win.webContents.on('did-navigate-in-page', sendState)
}

function getEventWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function getWindowState(win: BrowserWindow | null): OratorioWindowState | null {
  if (!win || win.isDestroyed()) {
    return null
  }

  return snapshotWindowState(win)
}

function sendWindowState(win: BrowserWindow | null): void {
  const state = getWindowState(win)
  if (!state || !win || win.webContents.isDestroyed()) {
    return
  }

  win.webContents.send('desktop:window-state-changed', state)
}

function registerProtocolClient(): void {
  try {
    const isDefaultApp = (process as NodeJS.Process & { defaultApp?: boolean }).defaultApp === true
    if (isDefaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(appBindingProtocol, process.execPath, [resolve(process.argv[1])])
      return
    }

    app.setAsDefaultProtocolClient(appBindingProtocol)
  } catch {
    // Protocol registration is best effort; packaged installers also declare it.
  }
}

function queueAppBindingUrls(urls: readonly string[]): void {
  if (urls.length === 0) return
  pendingAppBindingUrls.push(...urls)
  const win = mainWindow
  if (win && !win.isDestroyed()) {
    if (shouldActivateWindowForAppBindingUrls(urls)) {
      showWindow(win)
    }
    flushPendingAppBindingUrls(win)
  }
}

function flushPendingAppBindingUrls(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed() || pendingAppBindingUrls.length === 0) return
  const status = serverManager?.getStatus()
  const urls = pendingAppBindingUrls.filter((url) => canDeliverAppBindingHandoff(url, status))
  pendingAppBindingUrls = pendingAppBindingUrls.filter((url) => !canDeliverAppBindingHandoff(url, status))
  for (const url of urls) {
    win.webContents.send('desktop:app-binding-handoff', url)
  }
}

function sendServerStatus(status: OratorioServerStatus): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('desktop:server-status-changed', status)
}

function resolveAppIconPath(): string | null {
  const fileName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const candidates = [
    join(process.resourcesPath, fileName),
    join(app.getAppPath(), 'resources', fileName),
    resolve(app.getAppPath(), '..', 'desktop', 'resources', fileName)
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function resolveAppIcon() {
  const iconPath = resolveAppIconPath()
  if (!iconPath) {
    return undefined
  }

  const icon = nativeImage.createFromPath(iconPath)
  return icon.isEmpty() ? undefined : icon
}

function desktopPreferencesPath(): string {
  return resolveDesktopPreferencesPath(app)
}

function readDesktopPreferences(): DesktopPreferences {
  const preferencesPath = desktopPreferencesPath()
  if (!existsSync(preferencesPath)) {
    return {}
  }

  try {
    const parsed = JSON.parse(readFileSync(preferencesPath, 'utf8')) as Partial<DesktopPreferences>
    const theme = parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : undefined
    const closeBehavior = resolveWindowCloseBehavior(parsed)
    const serverConnection = normalizeStoredServerConnection(parsed)
    return { theme, closeBehavior, ...serverConnection }
  } catch {
    return {}
  }
}

function getServerConnectionPreferences(): OratorioServerConnectionPreferences {
  return normalizeStoredServerConnection(readDesktopPreferences())
}

function normalizeStoredServerConnection(preferences: Partial<DesktopPreferences>): OratorioServerConnectionPreferences {
  const serverMode = preferences.serverMode === 'remote' ? 'remote' : 'local'
  const remoteTransport = preferences.remoteTransport === 'sshTunnel' ? 'sshTunnel' : 'url'
  const remoteServerUrl = typeof preferences.remoteServerUrl === 'string' && preferences.remoteServerUrl.trim()
    ? preferences.remoteServerUrl.trim().replace(/\/+$/, '')
    : null
  return {
    serverMode,
    remoteServerUrl,
    remoteTransport,
    sshTunnel: normalizeSshTunnelPreferences(preferences.sshTunnel)
  }
}

function normalizeServerConnectionDraft(draft: Partial<OratorioServerConnectionPreferences>): OratorioServerConnectionPreferences {
  const current = getServerConnectionPreferences()
  const serverMode = draft.serverMode === 'remote' ? 'remote' : 'local'
  const remoteTransport = draft.remoteTransport === 'sshTunnel' || draft.remoteTransport === 'url'
    ? draft.remoteTransport
    : current.remoteTransport
  const remoteCandidate = draft.remoteServerUrl !== undefined ? draft.remoteServerUrl : current.remoteServerUrl
  const remoteServerUrl = serverMode === 'remote' && remoteTransport === 'url'
    ? (remoteCandidate?.trim() ? normalizeRemoteServerUrl(remoteCandidate) : null)
    : (remoteCandidate?.trim() ? remoteCandidate.trim().replace(/\/+$/, '') : null)
  const sshTunnel = normalizeSshTunnelPreferences({
    ...current.sshTunnel,
    ...draft.sshTunnel
  })
  if (serverMode === 'remote' && remoteTransport === 'url' && !remoteServerUrl) {
    throw new Error('Remote Oratorio server URL is not configured.')
  }
  if (serverMode === 'remote' && remoteTransport === 'sshTunnel' && !isValidSshTarget(sshTunnel.sshTarget)) {
    throw new Error('SSH target is required. Use a host, user@host, or SSH config alias.')
  }

  return {
    ...DEFAULT_CONNECTION_PREFERENCES,
    serverMode,
    remoteServerUrl,
    remoteTransport,
    sshTunnel
  }
}

function getStartupTheme(): DesktopTheme {
  return resolveStartupTheme(readDesktopPreferences())
}

function getWindowCloseBehavior(): OratorioWindowCloseBehavior {
  return resolveWindowCloseBehavior(readDesktopPreferences())
}

function writeDesktopPreferences(preferences: DesktopPreferences): void {
  mkdirSync(resolveDesktopSettingsRoot(app), { recursive: true })
  writeFileSync(desktopPreferencesPath(), `${JSON.stringify(preferences, null, 2)}\n`, 'utf8')
}

function ensureTray(): void {
  if (tray && !tray.isDestroyed()) {
    return
  }

  const appIcon = resolveAppIcon()
  if (!appIcon) {
    return
  }

  tray = new Tray(appIcon)
  tray.setToolTip('Oratorio')
  tray.on('click', () => {
    showMainWindow()
  })
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Oratorio', click: () => showMainWindow() },
    { type: 'separator' },
    { label: 'Quit Oratorio', click: () => app.quit() }
  ]))
}

function showMainWindow(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) {
    void boot()
    return
  }

  showWindow(win)
}

function showWindow(win: BrowserWindow): void {
  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
}

function resolveStatusLogoPath(): string | null {
  const candidates = [
    join(app.getAppPath(), 'out', 'renderer', 'oratorio-icon.svg'),
    join(app.getAppPath(), 'src', 'renderer', 'public', 'oratorio-icon.svg'),
    resolve(app.getAppPath(), '..', 'desktop', 'src', 'renderer', 'public', 'oratorio-icon.svg'),
    resolve(app.getAppPath(), '..', '..', 'desktop', 'src', 'renderer', 'public', 'oratorio-icon.svg')
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function resolveStatusLogoDataUri(): string | null {
  const logoPath = resolveStatusLogoPath()
  if (!logoPath) {
    return null
  }

  try {
    return svgToDataUri(readFileSync(logoPath, 'utf8'))
  } catch {
    return null
  }
}

function loadStatusPage(win: BrowserWindow, title: string, detail = '', theme: DesktopTheme = getStartupTheme()): Promise<void> {
  const html = buildStatusPageHtml({
    title,
    detail: detail || 'The local desktop server is starting.',
    theme,
    logoDataUri: resolveStatusLogoDataUri()
  })
  return win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

async function loadRenderer(win: BrowserWindow, serverUrl: string | null | undefined, theme: DesktopTheme = getStartupTheme()): Promise<void> {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL?.trim()
  if (rendererUrl) {
    const url = buildRendererStartupUrl(rendererUrl, serverUrl, theme)
    await waitForUrl(url, 20_000)
    await win.loadURL(url)
    return
  }

  await win.loadFile(join(__dirname, '../renderer/index.html'), {
    query: buildRendererStartupQuery(serverUrl, theme)
  })
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isSameOrigin(currentUrl: string, nextUrl: string): boolean {
  try {
    const current = new URL(currentUrl)
    const next = new URL(nextUrl)
    return current.origin === next.origin || current.protocol === 'data:'
  } catch {
    return false
  }
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now()
  let lastError: unknown = null
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : ''
  throw new Error(`Could not load ${url} within ${timeoutMs}ms.${suffix}`)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  queueAppBindingUrls(extractAppBindingUrls(process.argv))

  app.on('second-instance', (_event, argv) => {
    queueAppBindingUrls(extractAppBindingUrls(argv))
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    queueAppBindingUrls([url])
  })

  app.whenReady().then(() => {
    void boot()
  })
}

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void boot()
  } else {
    showMainWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (isQuitting) {
    return
  }

  isQuitting = true
  event.preventDefault()
  const shutdown = serverManager?.shutdown() ?? Promise.resolve()
  void shutdown
    .catch(() => {})
    .finally(() => app.quit())
})

app.on('will-quit', () => {
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null
})

export type { OratorioServerStatus }
