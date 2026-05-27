import type { OratorioDesktopApi } from './index'

declare global {
  interface Window {
    oratorioDesktop: OratorioDesktopApi
  }
}

export {}
