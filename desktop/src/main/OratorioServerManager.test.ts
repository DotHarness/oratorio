import { mkdirSync, writeFileSync } from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { resolveServerExecutablePath } from './OratorioServerManager'

const exeName = process.platform === 'win32' ? 'Oratorio.Server.exe' : 'Oratorio.Server'

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
