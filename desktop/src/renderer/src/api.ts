import i18n from './i18n'

const explicitApiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_ORATORIO_API_URL)
let currentServerBaseUrl = resolveInitialServerBaseUrl(explicitApiBaseUrl)

export function setServerBaseUrl(url: string | null): void {
  currentServerBaseUrl = normalizeBaseUrl(url) ?? ''
}

export function getServerBaseUrl(): string {
  return currentServerBaseUrl
}

export type ErrorResponse = {
  error?: {
    code: string
    message: string
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path)
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function apiPut<T>(path: string, body: object): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function apiPatch<T>(path: string, body: object): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, init)
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorResponse | null
    const fallback = payload?.error?.message ?? i18n.t('common:requestFailed', { status: response.status })
    const code = payload?.error?.code
    throw new Error(code ? i18n.t(`errors:${code}`, { defaultValue: fallback }) : fallback)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.text()
  return (body ? JSON.parse(body) : undefined) as T
}

function getApiBaseUrl(): string {
  if (explicitApiBaseUrl) {
    return explicitApiBaseUrl
  }

  const serverBaseUrl = getServerBaseUrl()
  if (serverBaseUrl) {
    return joinBasePath(serverBaseUrl, '/api/v1')
  }

  if (typeof window !== 'undefined' && window.oratorioDesktop) {
    throw new Error(i18n.t('common:serverUnavailable'))
  }

  return '/api/v1'
}

function resolveInitialServerBaseUrl(apiBase: string | null): string {
  if (typeof window !== 'undefined') {
    const fromQuery = normalizeBaseUrl(new URLSearchParams(window.location.search).get('serverUrl'))
    if (fromQuery) {
      return fromQuery
    }
  }

  const fromEnvironment = normalizeBaseUrl(import.meta.env.VITE_ORATORIO_SERVER_URL)
  if (fromEnvironment) {
    return fromEnvironment
  }

  return deriveServerBaseUrl(apiBase)
}

function deriveServerBaseUrl(apiBase: string | null): string {
  if (!apiBase) {
    return ''
  }

  if (apiBase.endsWith('/api/v1')) {
    return apiBase.slice(0, -'/api/v1'.length)
  }

  try {
    return new URL(apiBase).origin
  } catch {
    return ''
  }
}

function joinBasePath(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return path
  }

  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.replace(/\/+$/, '') : null
}
