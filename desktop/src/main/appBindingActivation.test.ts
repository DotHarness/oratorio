import { describe, expect, it } from 'vitest'
import {
  appBindingOperation,
  canDeliverAppBindingHandoffs,
  extractAppBindingUrls,
  shouldActivateWindowForAppBindingUrls
} from './appBindingActivation'

describe('App Binding activation policy', () => {
  it('extracts Oratorio protocol URLs from process arguments', () => {
    expect(extractAppBindingUrls([
      '--flag',
      'oratorio://dotcraft/connect?request=req_1&token=token_1',
      'https://example.test',
      'oratorio://dotcraft/bind?request=req_2&token=token_2'
    ])).toEqual([
      'oratorio://dotcraft/connect?request=req_1&token=token_1',
      'oratorio://dotcraft/bind?request=req_2&token=token_2'
    ])
  })

  it('parses host and path operation forms', () => {
    expect(appBindingOperation('oratorio://dotcraft/connect?request=req_1&token=token_1')).toBe('connect')
    expect(appBindingOperation('oratorio://dotcraft/bind?request=req_2&token=token_2')).toBe('bind')
    expect(appBindingOperation('oratorio://bind?request=req_3&token=token_3')).toBe('bind')
    expect(appBindingOperation('oratorio://open/task/ORA-1')).toBe('open')
  })

  it('keeps bind handoffs silent when Oratorio is already running', () => {
    expect(shouldActivateWindowForAppBindingUrls([
      'oratorio://dotcraft/bind?request=req_1&token=token_1'
    ])).toBe(false)
  })

  it('activates for connect, unknown, and invalid URLs as the safer policy', () => {
    expect(shouldActivateWindowForAppBindingUrls([
      'oratorio://dotcraft/connect?request=req_1&token=token_1'
    ])).toBe(true)
    expect(shouldActivateWindowForAppBindingUrls([
      'oratorio://open/task/ORA-1'
    ])).toBe(true)
    expect(shouldActivateWindowForAppBindingUrls([
      'oratorio://dotcraft/unknown?request=req_1&token=token_1'
    ])).toBe(true)
    expect(shouldActivateWindowForAppBindingUrls(['not-a-url'])).toBe(true)
  })

  it('delivers handoff URLs only after the desktop server URL is ready', () => {
    expect(canDeliverAppBindingHandoffs({
      state: 'running',
      serverUrl: 'http://127.0.0.1:5087'
    })).toBe(true)
    expect(canDeliverAppBindingHandoffs({
      state: 'running',
      serverUrl: '   '
    })).toBe(false)
    expect(canDeliverAppBindingHandoffs({
      state: 'starting',
      serverUrl: 'http://127.0.0.1:5087'
    })).toBe(false)
    expect(canDeliverAppBindingHandoffs({
      state: 'error',
      serverUrl: 'http://127.0.0.1:5087'
    })).toBe(false)
    expect(canDeliverAppBindingHandoffs({
      state: 'running',
      serverUrl: null
    })).toBe(false)
    expect(canDeliverAppBindingHandoffs({
      state: 'running',
      serverUrl: 'http://127.0.0.1:5087',
      backendKind: 'remote'
    })).toBe(false)
    expect(canDeliverAppBindingHandoffs(null)).toBe(false)
  })
})
