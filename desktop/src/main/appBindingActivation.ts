export const appBindingProtocol = 'oratorio'

export interface AppBindingHandoffDeliveryStatus {
  state?: string | null
  serverUrl?: string | null
}

export function extractAppBindingUrls(argv: readonly string[]): string[] {
  return argv.filter((value) => {
    try {
      const url = new URL(value)
      return url.protocol === `${appBindingProtocol}:`
    } catch {
      return false
    }
  })
}

export function appBindingOperation(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== `${appBindingProtocol}:`) {
      return null
    }

    const pathOperation = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
    return pathOperation || url.hostname.toLowerCase() || null
  } catch {
    return null
  }
}

export function shouldActivateWindowForAppBindingUrls(urls: readonly string[]): boolean {
  if (urls.length === 0) {
    return false
  }

  return urls.some((url) => appBindingOperation(url) !== 'bind')
}

export function canDeliverAppBindingHandoffs(status: AppBindingHandoffDeliveryStatus | null | undefined): boolean {
  return status?.state === 'running' && Boolean(status.serverUrl?.trim())
}
