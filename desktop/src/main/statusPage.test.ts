import { describe, expect, it } from 'vitest'
import { buildStatusPageHtml, svgToDataUri } from './statusPage'

describe('status page HTML', () => {
  it('renders centered themed status content with the Oratorio logo', () => {
    const html = buildStatusPageHtml({
      title: 'Oratorio',
      detail: 'Starting Oratorio...',
      theme: 'light',
      logoDataUri: svgToDataUri('<svg xmlns="http://www.w3.org/2000/svg"><title>Oratorio</title></svg>')
    })

    expect(html).toContain('<body data-theme="light">')
    expect(html).toContain('class="status-logo"')
    expect(html).toContain('data:image/svg+xml;charset=utf-8,')
    expect(html).toContain('place-items: center;')
    expect(html).toContain('text-align: center;')
    expect(html).toContain('<h1>Oratorio</h1>')
    expect(html).toContain('<p class="status-detail status-gradient-text">Starting Oratorio...</p>')
    expect(html).toContain('status-logo-arrive')
    expect(html).toContain('status-logo-breathe')
    expect(html).toContain('status-gradient-text')
    expect(html).toContain('status-gradient-flow')
    expect(html).toContain('@media (prefers-reduced-motion: reduce)')
    expect(html).toContain('--shell-chrome-surface:')
    expect(html).toContain('#f7f9fc')
    expect(html).toContain('background: var(--shell-chrome-surface);')
    expect(html).toContain('background: transparent;')
  })

  it('uses lucide-style SVG window controls and toggles the restore icon', () => {
    const html = buildStatusPageHtml({
      title: 'Starting Oratorio...',
      detail: 'The local desktop server is starting.',
      theme: 'dark',
      logoDataUri: null
    })

    expect(html).toContain('data-window-action="minimize"')
    expect(html).toContain('data-window-action="maximize"')
    expect(html).toContain('data-window-action="close"')
    expect(html).toContain('<path d="M5 12h14"/>')
    expect(html).toContain('<rect width="18" height="18" x="3" y="3" rx="2"/>')
    expect(html).toContain('<path d="M4 14h6v6"/>')
    expect(html).toContain('<path d="M18 6 6 18"/>')
    expect(html).toContain("maximize.classList.toggle('is-maximized', isMaximized);")
  })

  it('omits the logo image when no logo data URI is available', () => {
    const html = buildStatusPageHtml({
      title: 'Oratorio could not start',
      detail: 'Server failed.',
      theme: 'dark',
      logoDataUri: null
    })

    expect(html).not.toContain('class="status-logo"')
    expect(html).not.toContain('src=""')
    expect(html).toContain('<p class="status-detail status-gradient-text">Server failed.</p>')
  })
})
