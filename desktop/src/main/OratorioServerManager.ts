import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import net from 'net'
import { dirname, join, resolve } from 'path'
import { EventEmitter } from 'events'
import type { App } from 'electron'
import { resolveDesktopConfigPath, resolveDesktopStateRoot } from './desktopPaths'
import { SshTunnelManager } from './SshTunnelManager'
import {
  createTunnelStatus,
  DEFAULT_CONNECTION_PREFERENCES,
  normalizeSshTunnelPreferences,
  type OratorioServerConnectionPreferences,
  type OratorioServerStatus
} from '../shared/desktopConnection'

export type {
  LocalSshConfigInfo,
  OratorioRemoteTransport,
  OratorioServerConnectionPreferences,
  OratorioServerStatus,
  OratorioSshTunnelPreferences,
  OratorioSshTunnelStatus
} from '../shared/desktopConnection'

export interface OratorioServerManagerOptions {
  app: Pick<App, 'isPackaged' | 'getAppPath' | 'getPath'>
  resourcesPath: string
  env?: NodeJS.ProcessEnv
  getConnectionPreferences?: () => OratorioServerConnectionPreferences
  sshTunnels?: SshTunnelManager
}

export interface ResolvedServerExecutable {
  path: string | null
  source: 'packaged' | 'release' | 'missing'
}

const DEV_SERVER_URL = 'http://127.0.0.1:5087'
const DESKTOP_SERVER_FILE = 'desktop-server.json'
const HEALTH_TIMEOUT_MS = 30_000
const REMOTE_HEALTH_TIMEOUT_MS = 10_000
const HEALTH_POLL_MS = 250
const SHUTDOWN_GRACE_MS = 1_500

export class OratorioServerManager extends EventEmitter {
  private readonly app: OratorioServerManagerOptions['app']
  private readonly resourcesPath: string
  private readonly env: NodeJS.ProcessEnv
  private readonly getConnectionPreferences: () => OratorioServerConnectionPreferences
  private readonly sshTunnels: SshTunnelManager
  private process: ChildProcess | null = null
  private status: OratorioServerStatus = {
    state: 'stopped',
    serverUrl: null,
    reusedExistingServer: false,
    backendKind: 'managedLocal',
    serverMode: 'local',
    remoteTransport: 'url',
    tunnel: null,
    pid: null,
    errorMessage: null
  }
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: OratorioServerManagerOptions) {
    super()
    this.app = options.app
    this.resourcesPath = options.resourcesPath
    this.env = options.env ?? process.env
    this.getConnectionPreferences = options.getConnectionPreferences ?? (() => DEFAULT_CONNECTION_PREFERENCES)
    this.sshTunnels = options.sshTunnels ?? new SshTunnelManager()
  }

  getStatus(): OratorioServerStatus {
    return { ...this.status }
  }

  async ensureStarted(): Promise<OratorioServerStatus> {
    if (this.status.state === 'running') {
      return this.getStatus()
    }

    const connection = this.resolveConnectionPreferences()
    this.status = {
      state: 'starting',
      serverUrl: connection.serverMode === 'remote' ? connection.remoteServerUrl : null,
      reusedExistingServer: false,
      backendKind: connection.serverMode === 'remote' ? 'remote' : 'managedLocal',
      serverMode: connection.serverMode,
      remoteTransport: connection.remoteTransport,
      tunnel: connection.serverMode === 'remote' && connection.remoteTransport === 'sshTunnel'
        ? createTunnelStatus('starting', connection.sshTunnel)
        : null,
      pid: null,
      errorMessage: null
    }
    this.emit('status', this.getStatus())

    try {
      if (connection.serverMode === 'remote') {
        if (connection.remoteTransport === 'sshTunnel') {
          if (!connection.sshTunnel.autoStart) {
            throw new Error('SSH tunnel auto-start is disabled for this remote connection.')
          }

          const tunnel = await this.sshTunnels.open(connection.sshTunnel)
          if (!tunnel.localUrl) {
            throw new Error('SSH tunnel did not return a local URL.')
          }
          this.status = {
            ...this.status,
            serverUrl: tunnel.localUrl,
            tunnel
          }
          this.emit('status', this.getStatus())

          try {
            await waitForHealth(tunnel.localUrl, REMOTE_HEALTH_TIMEOUT_MS)
          } catch (error) {
            if (tunnel.owned) {
              await this.sshTunnels.close()
            }
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Remote Oratorio did not become healthy through the SSH tunnel. ${message}`)
          }

          this.status = {
            state: 'running',
            serverUrl: tunnel.localUrl,
            reusedExistingServer: true,
            backendKind: 'remote',
            serverMode: 'remote',
            remoteTransport: 'sshTunnel',
            tunnel,
            pid: null,
            errorMessage: null
          }
          this.emit('status', this.getStatus())
          return this.getStatus()
        }

        const serverUrl = normalizeRemoteServerUrl(connection.remoteServerUrl)
        this.status = {
          ...this.status,
          serverUrl,
          remoteTransport: 'url',
          tunnel: null
        }
        this.emit('status', this.getStatus())
        await waitForHealth(serverUrl, REMOTE_HEALTH_TIMEOUT_MS)

        this.status = {
          state: 'running',
          serverUrl,
          reusedExistingServer: true,
          backendKind: 'remote',
          serverMode: 'remote',
          remoteTransport: 'url',
          tunnel: null,
          pid: null,
          errorMessage: null
        }
        this.emit('status', this.getStatus())
        return this.getStatus()
      }

      const serverUrl = this.app.isPackaged
        ? `http://127.0.0.1:${await this.resolveLoopbackPort()}`
        : normalizeBaseUrl(this.env.ORATORIO_DESKTOP_SERVER_URL ?? DEV_SERVER_URL)

      if (!this.app.isPackaged && await isHealthy(serverUrl)) {
        this.status = {
          state: 'running',
          serverUrl,
          reusedExistingServer: true,
          backendKind: 'reusedLocal',
          serverMode: 'local',
          remoteTransport: connection.remoteTransport,
          tunnel: null,
          pid: null,
          errorMessage: null
        }
        this.emit('status', this.getStatus())
        return this.getStatus()
      }

      this.spawnServer(serverUrl)
      await waitForHealth(serverUrl, HEALTH_TIMEOUT_MS)

      this.status = {
        state: 'running',
        serverUrl,
        reusedExistingServer: false,
        backendKind: 'managedLocal',
        serverMode: 'local',
        remoteTransport: connection.remoteTransport,
        tunnel: null,
        pid: this.process?.pid ?? null,
        errorMessage: null
      }
      this.emit('status', this.getStatus())
      return this.getStatus()
    } catch (error) {
      if (connection.serverMode === 'remote' && connection.remoteTransport === 'sshTunnel') {
        await this.sshTunnels.close()
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.status = {
        ...this.status,
        state: 'error',
        pid: this.process?.pid ?? null,
        tunnel: connection.serverMode === 'remote' && connection.remoteTransport === 'sshTunnel'
          ? createTunnelStatus('error', connection.sshTunnel, { errorMessage })
          : this.status.tunnel,
        errorMessage
      }
      this.emit('status', this.getStatus())
      throw error
    }
  }

  async restart(): Promise<OratorioServerStatus> {
    await this.shutdown()
    return this.ensureStarted()
  }

  async shutdown(): Promise<void> {
    await this.sshTunnels.close()
    if (!this.process) {
      if (this.status.state !== 'running' || this.status.reusedExistingServer) {
        const connection = this.resolveConnectionPreferences()
        this.status = {
          state: 'stopped',
          serverUrl: null,
          reusedExistingServer: false,
          backendKind: connection.serverMode === 'remote' ? 'remote' : 'managedLocal',
          serverMode: connection.serverMode,
          remoteTransport: connection.remoteTransport,
          tunnel: null,
          pid: null,
          errorMessage: null
        }
        this.emit('status', this.getStatus())
      }
      return
    }

    const child = this.process
    this.process = null
    clearTimer(this.shutdownTimer)
    this.shutdownTimer = null

    await new Promise<void>((resolveShutdown) => {
      let settled = false
      const settle = (): void => {
        if (settled) return
        settled = true
        clearTimer(this.shutdownTimer)
        this.shutdownTimer = null
        resolveShutdown()
      }

      child.once('exit', settle)
      try {
        child.kill('SIGTERM')
      } catch {
        settle()
      }

      this.shutdownTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // Already gone.
        }
        settle()
      }, SHUTDOWN_GRACE_MS)
    })

    this.status = {
      state: 'stopped',
      serverUrl: null,
      reusedExistingServer: false,
      backendKind: this.resolveConnectionPreferences().serverMode === 'remote' ? 'remote' : 'managedLocal',
      serverMode: this.resolveConnectionPreferences().serverMode,
      remoteTransport: this.resolveConnectionPreferences().remoteTransport,
      tunnel: null,
      pid: null,
      errorMessage: null
    }
    this.emit('status', this.getStatus())
  }

  private spawnServer(serverUrl: string): void {
    const stateRoot = this.resolveStateRoot()

    const env = {
      ...process.env,
      ...this.env,
      ASPNETCORE_URLS: serverUrl,
      ORATORIO_CONFIG_PATH: this.resolveConfigPath(),
      ORATORIO_STATE_ROOT: stateRoot
    }

    const command = this.app.isPackaged ? this.resolvePackagedServer() : 'dotnet'
    const args = this.app.isPackaged
      ? []
      : ['run', '--project', resolve(this.app.getAppPath(), '..', 'server', 'Oratorio.Server.csproj'), '--urls', serverUrl]

    const child = spawn(command, args, {
      cwd: this.app.isPackaged ? join(this.resourcesPath, 'server') : resolve(this.app.getAppPath(), '..'),
      env,
      stdio: ['ignore', 'ignore', 'inherit'],
      windowsHide: true
    })

    this.process = child
    child.once('error', (error) => {
      this.status = {
        ...this.status,
        state: 'error',
        pid: null,
        errorMessage: error.message
      }
      this.emit('status', this.getStatus())
    })
    child.once('exit', (code, signal) => {
      if (this.process !== child) {
        return
      }

      this.process = null
      this.status = {
        ...this.status,
        state: 'error',
        pid: null,
        errorMessage: `Oratorio server exited unexpectedly (${code ?? signal ?? 'unknown'}).`
      }
      this.emit('crash', this.getStatus())
      this.emit('status', this.getStatus())
    })
  }

  private resolvePackagedServer(): string {
    const resolved = resolveServerExecutablePath({
      resourcesPath: this.resourcesPath,
      appPath: this.app.getAppPath()
    })
    if (!resolved.path) {
      throw new Error('Bundled oratorio-server.exe was not found. Rebuild or reinstall Oratorio Desktop.')
    }

    return resolved.path
  }

  private resolveConfigPath(): string {
    return this.env.ORATORIO_CONFIG_PATH?.trim() || resolveDesktopConfigPath(this.app)
  }

  private resolveStateRoot(): string {
    return this.env.ORATORIO_STATE_ROOT?.trim() || resolveDesktopStateRoot(this.app)
  }

  private resolveConnectionPreferences(): OratorioServerConnectionPreferences {
    const preferences = this.getConnectionPreferences()
    return {
      serverMode: preferences.serverMode === 'remote' ? 'remote' : 'local',
      remoteTransport: preferences.remoteTransport === 'sshTunnel' ? 'sshTunnel' : 'url',
      remoteServerUrl: typeof preferences.remoteServerUrl === 'string' && preferences.remoteServerUrl.trim()
        ? preferences.remoteServerUrl.trim().replace(/\/+$/, '')
        : null,
      sshTunnel: normalizeSshTunnelPreferences(preferences.sshTunnel)
    }
  }

  // Reuse the same loopback port across restarts when it is still free, so the
  // apiBase DotCraft persisted for its App Binding stays valid and the embedded
  // board reconnects without a manual re-bind. Falls back to a fresh free port
  // (persisted for next time) only when the remembered port is taken.
  private async resolveLoopbackPort(): Promise<number> {
    const portFile = join(this.resolveStateRoot(), DESKTOP_SERVER_FILE)
    const persisted = readPersistedPort(portFile)
    if (persisted !== null && (await isPortBindable(persisted))) {
      return persisted
    }

    const port = await findAvailableLoopbackPort()
    writePersistedPort(portFile, port)
    return port
  }
}

export function readPersistedPort(file: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { loopbackPort?: unknown }
    const port = typeof parsed.loopbackPort === 'number' ? parsed.loopbackPort : Number.NaN
    return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null
  } catch {
    return null
  }
}

export function writePersistedPort(file: string, port: number): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ loopbackPort: port }, null, 2))
  } catch {
    // Best-effort: failing to persist only means the next launch may pick a new
    // port, which the startup re-announce will reconcile.
  }
}

function isPortBindable(port: number): Promise<boolean> {
  return new Promise((resolveBindable) => {
    const server = net.createServer()
    server.once('error', () => resolveBindable(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolveBindable(true))
    })
  })
}

export function resolveServerExecutablePath(options: {
  resourcesPath: string
  appPath: string
}): ResolvedServerExecutable {
  const packaged = join(options.resourcesPath, 'server', executableName())
  if (existsSync(packaged)) {
    return { path: packaged, source: 'packaged' }
  }

  const release = resolve(options.appPath, '..', 'build', 'release', 'server', executableName())
  if (existsSync(release)) {
    return { path: release, source: 'release' }
  }

  return { path: null, source: 'missing' }
}

export async function waitForHealth(serverUrl: string, timeoutMs: number): Promise<void> {
  const started = Date.now()
  let lastError: unknown = null

  while (Date.now() - started < timeoutMs) {
    try {
      if (await isHealthy(serverUrl)) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await sleep(HEALTH_POLL_MS)
  }

  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : ''
  throw new Error(`Oratorio server did not become healthy within ${timeoutMs}ms.${suffix}`)
}

async function isHealthy(serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeBaseUrl(serverUrl)}/health`)
    if (!response.ok) {
      return false
    }

    const body = await response.json().catch(() => null) as { service?: unknown; status?: unknown } | null
    return body?.service === 'oratorio' && body.status === 'ok'
  } catch {
    return false
  }
}

async function findAvailableLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer()
    server.once('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (typeof address === 'object' && address?.port) {
          resolvePort(address.port)
        } else {
          rejectPort(new Error('Could not allocate a loopback port.'))
        }
      })
    })
  })
}

function executableName(): string {
  return process.platform === 'win32' ? 'oratorio-server.exe' : 'oratorio-server'
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

export function normalizeRemoteServerUrl(value: string | null | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error('Remote Oratorio server URL is not configured.')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Remote Oratorio server URL must be an absolute http or https URL.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Remote Oratorio server URL must use http or https.')
  }

  if (parsed.username || parsed.password) {
    throw new Error('Remote Oratorio server URL must not include credentials.')
  }

  const path = parsed.pathname.replace(/\/+$/, '')
  if (path && path !== '') {
    throw new Error('Remote Oratorio server URL must not include a path.')
  }

  parsed.pathname = ''
  parsed.search = ''
  parsed.hash = ''
  return normalizeBaseUrl(parsed.toString())
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer) {
    clearTimeout(timer)
  }
}
