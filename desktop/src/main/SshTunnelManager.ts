import { spawn, type ChildProcess } from 'child_process'
import net from 'net'
import { homedir } from 'os'
import {
  buildSshTunnelArgs,
  createTunnelStatus,
  type OratorioSshTunnelPreferences,
  type OratorioSshTunnelStatus
} from '../shared/desktopConnection'

const TUNNEL_READY_TIMEOUT_MS = 8_000
const LOCAL_PORT_POLL_MS = 150

interface ActiveTunnel {
  process: ChildProcess
  status: OratorioSshTunnelStatus
}

export class SshTunnelManager {
  private active: ActiveTunnel | null = null

  constructor(private readonly sshPath: string = 'ssh') {}

  async open(preferences: OratorioSshTunnelPreferences): Promise<OratorioSshTunnelStatus> {
    await this.close()

    if (await isHealthyOratorioPort(preferences.preferredLocalPort)) {
      const localUrl = `http://127.0.0.1:${preferences.preferredLocalPort}`
      return createTunnelStatus('running', preferences, {
        localPort: preferences.preferredLocalPort,
        localUrl,
        owned: false
      })
    }

    const localPort = await resolveLocalPort(preferences.preferredLocalPort)
    const args = buildSshTunnelArgs(preferences, localPort)
    const proc = spawn(this.sshPath, args, {
      windowsHide: true,
      env: buildSshSpawnEnv()
    })

    let stderr = ''
    let spawnError: Error | null = null
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    proc.once('error', (error) => {
      spawnError = error
    })

    proc.on('close', () => {
      if (this.active?.process === proc) {
        this.active = null
      }
    })

    const ready = await waitForLocalPort(localPort, TUNNEL_READY_TIMEOUT_MS)
    if (!ready) {
      proc.kill()
      throw new Error(spawnError ? formatSpawnError(spawnError) : formatTunnelError(stderr))
    }

    const status = createTunnelStatus('running', preferences, {
      localPort,
      localUrl: `http://127.0.0.1:${localPort}`,
      owned: true
    })
    this.active = { process: proc, status }
    return status
  }

  getStatus(): OratorioSshTunnelStatus | null {
    return this.active?.status ?? null
  }

  async close(): Promise<void> {
    const active = this.active
    this.active = null
    if (!active || active.process.killed || active.process.exitCode != null || active.process.signalCode != null) {
      return
    }

    await new Promise<void>((resolveClose) => {
      const timer = setTimeout(() => {
        try {
          active.process.kill('SIGKILL')
        } catch {
          // Already gone.
        }
        resolveClose()
      }, 1_500)
      active.process.once('close', () => {
        clearTimeout(timer)
        resolveClose()
      })
      try {
        active.process.kill()
      } catch {
        clearTimeout(timer)
        resolveClose()
      }
    })
  }
}

export function buildSshSpawnEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...baseEnv }
  const home = homedir()
  if (home) {
    env.HOME ??= home
    if (process.platform === 'win32') {
      env.USERPROFILE ??= home
    }
  }
  return env
}

export async function resolveLocalPort(preferredPort: number): Promise<number> {
  if (await isPortBindable(preferredPort)) {
    return preferredPort
  }
  return findAvailableLoopbackPort()
}

export async function waitForLocalPort(port: number, timeoutMs = TUNNEL_READY_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolveReady) => {
    const attempt = (): void => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolveReady(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) {
          resolveReady(false)
        } else {
          setTimeout(attempt, LOCAL_PORT_POLL_MS)
        }
      })
    }
    attempt()
  })
}

async function isHealthyOratorioPort(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`)
    if (!response.ok) return false
    const body = await response.json().catch(() => null) as { service?: unknown; status?: unknown } | null
    return body?.service === 'oratorio' && body.status === 'ok'
  } catch {
    return false
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

function findAvailableLoopbackPort(): Promise<number> {
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

function formatTunnelError(stderr: string): string {
  const detail = stderr.trim()
  if (!detail) {
    return 'SSH tunnel failed to establish. Verify that ssh is installed and the target is reachable.'
  }
  if (/permission denied|publickey|batchmode/i.test(detail)) {
    return `${detail} Verify the SSH target in a terminal or configure an SSH key/agent.`
  }
  return detail
}

function formatSpawnError(error: Error): string {
  if ('code' in error && String((error as { code?: unknown }).code) === 'ENOENT') {
    return 'ssh was not found. Install OpenSSH or use Remote URL mode.'
  }
  return error.message
}
