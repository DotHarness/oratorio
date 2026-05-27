import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const mainDir = dirname(fileURLToPath(import.meta.url))
const rendererDir = resolve(mainDir, '..', 'renderer')

function readRendererFile(path: string): string {
  return readFileSync(resolve(rendererDir, path), 'utf8')
}

function cssBlock(source: string, selector: string, nextSelector: string): string {
  const start = source.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(nextSelector, start + selector.length)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('renderer glass surface styling', () => {
  it('keeps initial HTML fallback colors while allowing loaded renderer roots to become transparent', () => {
    const indexHtml = readRendererFile('index.html')
    const indexCss = readRendererFile('src/index.css')

    expect(indexHtml).toContain('background: #101317')
    expect(indexHtml).toContain('background: #f7f9fc')
    expect(indexCss).toContain(':root {\n  color: #e5e5e5;\n  background: transparent;')
    expect(indexCss).toContain(':root[data-launch-theme="light"] {\n  color: #0f172a;\n  background: transparent;')
    expect(indexCss).toContain('html,\nbody,\n#root {')
    expect(indexCss).toContain('overflow: hidden;')
    expect(indexCss).toContain('background: transparent;')
  })

  it('uses a shared chrome glass surface for the desktop frame without double-blurring the root', () => {
    const appCss = readRendererFile('src/App.css')
    const frameBlock = cssBlock(appCss, '.oratorio-desktop-frame {', '.app-shell,')
    const desktopHostedBlock = cssBlock(appCss, '.app-shell.desktop-hosted {', '.app-shell.desktop-hosted .placeholder-page,')

    expect(appCss).toContain('--shell-chrome-surface:')
    expect(appCss).toContain('--chrome-glass: var(--shell-chrome-surface);')
    expect(frameBlock).toContain('background: var(--chrome-glass);')
    expect(frameBlock).toContain('box-shadow: inset 0 0 0 1px var(--shell-chrome-border);')
    expect(frameBlock).not.toContain('backdrop-filter')
    expect(desktopHostedBlock).toContain('background: transparent;')
    expect(desktopHostedBlock).toContain('backdrop-filter: none;')
  })
})
