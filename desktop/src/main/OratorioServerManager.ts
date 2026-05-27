import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import net from 'net'
import { join, resolve } from 'path'
import { EventEmitter } from 'events'
import type { App } from 'electron'
import { resolveDesktopConfigPath } from './desktopPaths'

export type OratorioServerState = 'stopped' | 'starting' | 'running' | 'error'

export interface OratorioServerStatus {
  state: OratorioServerState
  serverUrl: string | null
  reusedExistingServer: boolean
  pid: number | null
  errorMessage: string | null
}

export interface OratorioServerManagerOptions {
  app: Pick<App, 'isPackaged' | 'getAppPath' | 'getPath'>
  resourcesPath: string
  env?: NodeJS.ProcessEnv
}

export interface ResolvedServerExecutable {
  path: string | null
  source: 'packaged' | 'release' | 'missing'
}

const DEV_SERVER_URL = 'http://127.0.0.1:5087'
const HEALTH_TIMEOUT_MS = 30_000
const HEALTH_POLL_MS = 250
const SHUTDOWN_GRACE_MS = 1_500

export class OratorioServerManager extends EventEmitter {
  private readonly app: OratorioServerManagerOptions['app']
  private readonly resourcesPath: string
  private readonly env: NodeJS.ProcessEnv
  private process: ChildProcess | null = null
  private status: OratorioServerStatus = {
    state: 'stopped',
    serverUrl: null,
    reusedExistingServer: false,
    pid: null,
    errorMessage: null
  }
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: OratorioServerManagerOptions) {
    super()
    this.app = options.app
    this.resourcesPath = options.resourcesPath
    this.env = options.env ?? process.env
  }

  getStatus(): OratorioServerStatus {
    return { ...this.status }
  }

  async ensureStarted(): Promise<OratorioServerStatus> {
    if (this.status.state === 'running') {
      return this.getStatus()
    }

    this.status = {
      state: 'starting',
      serverUrl: null,
      reusedExistingServer: false,
      pid: null,
      errorMessage: null
    }
    this.emit('status', this.getStatus())

    try {
      const serverUrl = this.app.isPackaged
        ? `http://127.0.0.1:${await findAvailableLoopbackPort()}`
        : normalizeBaseUrl(this.env.ORATORIO_DESKTOP_SERVER_URL ?? DEV_SERVER_URL)

      if (!this.app.isPackaged && await isHealthy(serverUrl)) {
        this.status = {
          state: 'running',
          serverUrl,
          reusedExistingServer: true,
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
        pid: this.process?.pid ?? null,
        errorMessage: null
      }
      this.emit('status', this.getStatus())
      return this.getStatus()
    } catch (error) {
      this.status = {
        ...this.status,
        state: 'error',
        pid: this.process?.pid ?? null,
        errorMessage: error instanceof Error ? error.message : String(error)
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
    if (!this.process) {
      if (this.status.state !== 'running' || this.status.reusedExistingServer) {
        this.status = {
          state: 'stopped',
          serverUrl: null,
          reusedExistingServer: false,
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
      pid: null,
      errorMessage: null
    }
    this.emit('status', this.getStatus())
  }

  private spawnServer(serverUrl: string): void {
    const env = {
      ...process.env,
      ...this.env,
      ASPNETCORE_URLS: serverUrl,
      ORATORIO_CONFIG_PATH: this.resolveConfigPath(),
      ORATORIO_STATE_ROOT: this.resolveStateRoot()
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
      throw new Error('Bundled Oratorio.Server.exe was not found. Rebuild or reinstall Oratorio Desktop.')
    }

    return resolved.path
  }

  private resolveConfigPath(): string {
    return this.env.ORATORIO_CONFIG_PATH?.trim() || resolveDesktopConfigPath(this.app)
  }

  private resolveStateRoot(): string {
    return this.env.ORATORIO_STATE_ROOT?.trim() || join(this.app.getPath('userData'), 'state')
  }
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
  return process.platform === 'win32' ? 'Oratorio.Server.exe' : 'Oratorio.Server'
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
  if (timer) {
    clearTimeout(timer)
  }
}
