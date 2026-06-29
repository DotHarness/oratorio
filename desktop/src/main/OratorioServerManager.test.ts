import { mkdirSync, writeFileSync } from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { normalizeRemoteServerUrl, readPersistedPort, resolveServerExecutablePath, writePersistedPort } from './OratorioServerManager'

const exeName = process.platform === 'win32' ? 'oratorio-server.exe' : 'oratorio-server'

describe('loopback port persistence', () => {
  it('round-trips a persisted port so it is reused across restarts', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'oratorio-port-')), 'desktop-server.json')
    writePersistedPort(file, 49321)
    expect(readPersistedPort(file)).toBe(49321)
  })

  it('returns null for a missing file, malformed json, or out-of-range port', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oratorio-port-'))
    expect(readPersistedPort(join(dir, 'absent.json'))).toBeNull()

    const garbage = join(dir, 'garbage.json')
    writeFileSync(garbage, 'not json')
    expect(readPersistedPort(garbage)).toBeNull()

    const outOfRange = join(dir, 'range.json')
    writeFileSync(outOfRange, JSON.stringify({ loopbackPort: 70000 }))
    expect(readPersistedPort(outOfRange)).toBeNull()
  })
})

describe('resolveServerExecutablePath', () => {
  it('prefers the packaged server under resources', () => {
    const root = mkdtempSync(join(tmpdir(), 'oratorio-desktop-'))
    const resources = join(root, 'resources')
    const appPath = join(root, 'desktop')
    mkdirSync(join(resources, 'server'), { recursive: true })
    mkdirSync(join(root, 'build', 'release', 'server'), { recursive: true })
    writeFileSync(join(resources, 'server', exeName), '')
    writeFileSync(join(root, 'build', 'release', 'server', exeName), '')

    expect(resolveServerExecutablePath({ resourcesPath: resources, appPath })).toEqual({
      path: join(resources, 'server', exeName),
      source: 'packaged'
    })
  })

  it('falls back to the repo release server during local preview', () => {
    const root = mkdtempSync(join(tmpdir(), 'oratorio-desktop-'))
    const resources = join(root, 'resources')
    const appPath = join(root, 'desktop')
    mkdirSync(join(root, 'build', 'release', 'server'), { recursive: true })
    writeFileSync(join(root, 'build', 'release', 'server', exeName), '')

    expect(resolveServerExecutablePath({ resourcesPath: resources, appPath })).toEqual({
      path: join(root, 'build', 'release', 'server', exeName),
      source: 'release'
    })
  })

  it('reports missing server artifacts clearly', () => {
    const root = mkdtempSync(join(tmpdir(), 'oratorio-desktop-'))

    expect(resolveServerExecutablePath({
      resourcesPath: join(root, 'resources'),
      appPath: join(root, 'desktop')
    })).toEqual({
      path: null,
      source: 'missing'
    })
  })
})

describe('normalizeRemoteServerUrl', () => {
  it('accepts http and https origins and trims trailing slashes', () => {
    expect(normalizeRemoteServerUrl(' http://127.0.0.1:5087/// ')).toBe('http://127.0.0.1:5087')
    expect(normalizeRemoteServerUrl('https://oratorio.internal')).toBe('https://oratorio.internal')
  })

  it('rejects unsupported protocols, credentials, and path prefixes', () => {
    expect(() => normalizeRemoteServerUrl('')).toThrow(/not configured/)
    expect(() => normalizeRemoteServerUrl('ws://127.0.0.1:5087')).toThrow(/http or https/)
    expect(() => normalizeRemoteServerUrl('http://user:pass@127.0.0.1:5087')).toThrow(/credentials/)
    expect(() => normalizeRemoteServerUrl('http://127.0.0.1:5087/oratorio')).toThrow(/path/)
  })
})
