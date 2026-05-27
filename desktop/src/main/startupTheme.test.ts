import { describe, expect, it } from 'vitest'
import {
  buildRendererStartupQuery,
  buildRendererStartupUrl,
  resolveStartupTheme,
} from './startupTheme'

describe('startup theme helpers', () => {
  it('uses dark as the desktop startup fallback when no preference exists', () => {
    const theme = resolveStartupTheme({})

    expect(theme).toBe('dark')
    expect(buildRendererStartupQuery(null, theme)).toEqual({ theme: 'dark' })
  })

  it('includes the server URL only when one is available', () => {
    expect(buildRendererStartupQuery('http://127.0.0.1:5087', 'dark')).toEqual({
      serverUrl: 'http://127.0.0.1:5087',
      theme: 'dark',
    })
  })

  it('preserves an explicit light preference across renderer startup URLs', () => {
    const theme = resolveStartupTheme({ theme: 'light' })

    expect(theme).toBe('light')
    expect(buildRendererStartupUrl('http://localhost:5173/?debug=true', 'http://127.0.0.1:5087', theme))
      .toBe('http://localhost:5173/?debug=true&serverUrl=http%3A%2F%2F127.0.0.1%3A5087&theme=light')
  })

  it('overwrites stale renderer theme query values with the resolved startup theme', () => {
    expect(buildRendererStartupUrl('http://localhost:5173/?theme=light', 'http://127.0.0.1:5087', 'dark'))
      .toBe('http://localhost:5173/?theme=dark&serverUrl=http%3A%2F%2F127.0.0.1%3A5087')
  })

  it('can build a renderer startup URL before the server URL is known', () => {
    expect(buildRendererStartupUrl('http://localhost:5173/?debug=true', null, 'light'))
      .toBe('http://localhost:5173/?debug=true&theme=light')
  })
})
