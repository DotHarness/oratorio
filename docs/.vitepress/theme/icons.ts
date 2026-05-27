// Sidebar icons sourced from `lucide-static`. We read each SVG at config-load
// time, strip the wrapper, and re-emit the inner markup inside our own <svg>
// with consistent stroke / sizing tokens.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const lucideDir = resolve(here, '..', '..', 'node_modules', 'lucide-static', 'icons')

const SVG_ATTRS =
  'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'

function loadLucide(name: string): string {
  const raw = readFileSync(resolve(lucideDir, `${name}.svg`), 'utf-8')
  const inner = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*<svg[\s\S]*?>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim()
  return `<svg ${SVG_ATTRS}>${inner}</svg>`
}

const SOURCES = {
  diamond: 'diamond',
  play: 'play',
  cog: 'settings',
  workspace: 'folder-tree',
  github: 'git-pull-request',
  gitlab: 'git-merge',
  layers: 'layers',
  grid: 'layout-grid',
  monitor: 'monitor',
  code: 'code',
  branch: 'git-branch',
  baton: 'wand-sparkles',
  book: 'book-open',
  tag: 'tag',
  matrix: 'list-checks',
  hammer: 'hammer'
} as const

export const ICONS = Object.fromEntries(
  Object.entries(SOURCES).map(([key, lucideName]) => [key, loadLucide(lucideName)])
) as Record<keyof typeof SOURCES, string>

export type IconKey = keyof typeof SOURCES

export function withIcon(key: IconKey, label: string): string {
  const icon = ICONS[key] ?? ''
  return `<span class="or-side-icon">${icon}</span><span class="or-side-label">${label}</span>`
}
