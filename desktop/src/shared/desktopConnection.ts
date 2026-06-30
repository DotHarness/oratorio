export type OratorioServerState = 'stopped' | 'starting' | 'running' | 'error'
export type OratorioServerMode = 'local' | 'remote'
export type OratorioBackendKind = 'managedLocal' | 'reusedLocal' | 'remote'
export type OratorioRemoteTransport = 'url' | 'sshTunnel'
export type OratorioTunnelState = 'stopped' | 'starting' | 'running' | 'error'

export interface OratorioSshTunnelPreferences {
  sshTarget: string
  identityFile?: string | null
  remoteHost: string
  remotePort: number
  preferredLocalPort: number
  autoStart: boolean
}

export interface OratorioSshTunnelStatus {
  state: OratorioTunnelState
  sshTarget: string | null
  localPort: number | null
  localUrl: string | null
  remoteHost: string | null
  remotePort: number | null
  owned: boolean
  errorMessage: string | null
}

export interface OratorioServerConnectionPreferences {
  serverMode: OratorioServerMode
  remoteServerUrl: string | null
  remoteTransport: OratorioRemoteTransport
  sshTunnel: OratorioSshTunnelPreferences
}

export interface OratorioServerStatus {
  state: OratorioServerState
  serverUrl: string | null
  reusedExistingServer: boolean
  backendKind: OratorioBackendKind
  serverMode: OratorioServerMode
  remoteTransport: OratorioRemoteTransport
  tunnel: OratorioSshTunnelStatus | null
  pid: number | null
  errorMessage: string | null
}

export type LocalSshIdentitySource = 'default' | 'config'

export interface LocalSshIdentity {
  path: string
  source: LocalSshIdentitySource
  exists: boolean
  hostAliases?: string[]
}

export interface LocalSshHostAlias {
  alias: string
  hostName?: string
  user?: string
  port?: string
  identityFiles: string[]
}

export interface LocalSshConfigInfo {
  sshDir: string
  configPath: string
  configExists: boolean
  agentAvailable: boolean
  aliases: LocalSshHostAlias[]
  identities: LocalSshIdentity[]
  error?: string
}

export const DEFAULT_SSH_TUNNEL_PREFERENCES: OratorioSshTunnelPreferences = {
  sshTarget: '',
  identityFile: null,
  remoteHost: '127.0.0.1',
  remotePort: 5087,
  preferredLocalPort: 5087,
  autoStart: true
}

export const DEFAULT_CONNECTION_PREFERENCES: OratorioServerConnectionPreferences = {
  serverMode: 'local',
  remoteServerUrl: null,
  remoteTransport: 'url',
  sshTunnel: DEFAULT_SSH_TUNNEL_PREFERENCES
}

export const DEFAULT_SSH_CONNECT_TIMEOUT_SEC = 10

const SSH_TARGET_RE = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/
const REMOTE_FORWARD_HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

export function isValidSshTarget(target: unknown): boolean {
  if (typeof target !== 'string') return false
  const trimmed = target.trim()
  if (!trimmed || trimmed.length > 255) return false
  return SSH_TARGET_RE.test(trimmed)
}

export function isValidIdentityFile(path: unknown): boolean {
  if (typeof path !== 'string') return false
  const trimmed = path.trim()
  if (!trimmed) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(trimmed)) return false
  if (trimmed.startsWith('-')) return false
  return true
}

export function isValidRemoteForwardHost(host: unknown): boolean {
  if (typeof host !== 'string') return false
  const trimmed = host.trim()
  if (!trimmed || trimmed.length > 255) return false
  return REMOTE_FORWARD_HOST_RE.test(trimmed)
}

export function isValidPort(port: unknown): boolean {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535
}

export function normalizeSshTunnelPreferences(input: Partial<OratorioSshTunnelPreferences> | null | undefined): OratorioSshTunnelPreferences {
  const remotePort = coercePort(input?.remotePort, DEFAULT_SSH_TUNNEL_PREFERENCES.remotePort)
  const preferredLocalPort = coercePort(input?.preferredLocalPort, DEFAULT_SSH_TUNNEL_PREFERENCES.preferredLocalPort)
  const remoteHost = typeof input?.remoteHost === 'string' && isValidRemoteForwardHost(input.remoteHost.trim())
    ? input.remoteHost.trim()
    : DEFAULT_SSH_TUNNEL_PREFERENCES.remoteHost
  const sshTarget = typeof input?.sshTarget === 'string' ? input.sshTarget.trim() : ''
  const identityFile = typeof input?.identityFile === 'string' && input.identityFile.trim()
    ? input.identityFile.trim()
    : null

  return {
    sshTarget,
    identityFile,
    remoteHost,
    remotePort,
    preferredLocalPort,
    autoStart: input?.autoStart !== false
  }
}

export function buildSshTunnelArgs(
  preferences: OratorioSshTunnelPreferences,
  localPort: number,
  connectTimeoutSec: number = DEFAULT_SSH_CONNECT_TIMEOUT_SEC
): string[] {
  if (!isValidSshTarget(preferences.sshTarget)) {
    throw new Error('SSH target must be a host, user@host, or SSH config alias.')
  }
  if (!isValidRemoteForwardHost(preferences.remoteHost)) {
    throw new Error('Remote tunnel host is invalid.')
  }
  if (!isValidPort(localPort) || !isValidPort(preferences.remotePort)) {
    throw new Error('Tunnel ports must be between 1 and 65535.')
  }

  const timeout = Math.max(1, Math.floor(connectTimeoutSec))
  const args = [
    '-N',
    '-o',
    'BatchMode=yes',
    '-o',
    `ConnectTimeout=${timeout}`,
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'ExitOnForwardFailure=yes',
    '-L',
    `127.0.0.1:${localPort}:${preferences.remoteHost}:${preferences.remotePort}`
  ]

  const identityFile = preferences.identityFile?.trim()
  if (identityFile) {
    if (!isValidIdentityFile(identityFile)) {
      throw new Error('SSH identity file is invalid.')
    }
    args.push('-i', identityFile, '-o', 'IdentitiesOnly=yes')
  }

  args.push('--', preferences.sshTarget)
  return args
}

export function createTunnelStatus(
  state: OratorioTunnelState,
  preferences: OratorioSshTunnelPreferences | null,
  patch: Partial<OratorioSshTunnelStatus> = {}
): OratorioSshTunnelStatus {
  return {
    state,
    sshTarget: preferences?.sshTarget || null,
    localPort: null,
    localUrl: null,
    remoteHost: preferences?.remoteHost ?? null,
    remotePort: preferences?.remotePort ?? null,
    owned: false,
    errorMessage: null,
    ...patch
  }
}

function coercePort(value: unknown, fallback: number): number {
  if (typeof value === 'number') {
    return isValidPort(value) ? value : fallback
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return isValidPort(parsed) ? parsed : fallback
  }
  return fallback
}
