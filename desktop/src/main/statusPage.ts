export type StatusPageTheme = 'dark' | 'light'

export interface StatusPageOptions {
  title: string
  detail: string
  theme: StatusPageTheme
  logoDataUri?: string | null
}

const maximizeIcon = iconSvg('<rect width="18" height="18" x="3" y="3" rx="2"/>', 13)
const minimizeIcon = iconSvg('<path d="M5 12h14"/>', 15)
const restoreIcon = iconSvg('<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>', 14)
const closeIcon = iconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 15)

export function buildStatusPageHtml({ title, detail, theme, logoDataUri }: StatusPageOptions): string {
  const logo = logoDataUri
    ? `<img class="status-logo" src="${escapeHtml(logoDataUri)}" alt="" aria-hidden="true">`
    : ''

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Oratorio</title>
  <style>
    :root { color-scheme: dark light; font-family: "Segoe UI", system-ui, sans-serif; }
    body {
      --bg-primary: #101317;
      --bg-secondary: #171b21;
      --bg-active: #253247;
      --text-primary: #e5e5e5;
      --text-secondary: #a0a0a0;
      --border-default: rgba(255, 255, 255, 0.1);
      --border-active: rgba(255, 255, 255, 0.18);
      --accent: #2f73d9;
      --warning: #f2c15d;
      --error: #ef4444;
      --shell-chrome-surface:
        linear-gradient(
          180deg,
          color-mix(in srgb, #11151a 90%, transparent),
          color-mix(in srgb, #0e1115 88%, transparent)
        );
      margin: 0;
      min-height: 100vh;
      display: grid;
      grid-template-rows: 36px minmax(0, 1fr);
      overflow: hidden;
      background: var(--shell-chrome-surface);
      color: var(--text-primary);
    }
    body[data-theme="light"] {
      --bg-primary: #f7f9fc;
      --bg-secondary: #ffffff;
      --bg-active: #eef4ff;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --border-default: #d7dee8;
      --border-active: #b6c7df;
      --accent: #2563eb;
      --warning: #b7791f;
      --error: #dc2626;
      --shell-chrome-surface:
        linear-gradient(
          180deg,
          color-mix(in srgb, #f7f9fc 94%, transparent),
          color-mix(in srgb, #edf2f8 92%, transparent)
        );
    }
    @keyframes status-logo-arrive {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.94);
        filter: drop-shadow(0 0 0 color-mix(in srgb, var(--accent) 0%, transparent));
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter:
          drop-shadow(0 0 18px color-mix(in srgb, var(--accent) 30%, transparent))
          drop-shadow(0 0 14px color-mix(in srgb, var(--warning) 14%, transparent));
      }
    }
    @keyframes status-logo-breathe {
      0%, 100% {
        transform: translateY(0) scale(1);
      }
      50% {
        transform: translateY(-3px) scale(1.015);
      }
    }
    @keyframes status-gradient-flow {
      0% {
        background-position: 0 50%;
      }
      100% {
        background-position: 240px 50%;
      }
    }
    .desktop-titlebar {
      display: grid;
      height: 36px;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      border-bottom: 0;
      background: transparent;
      -webkit-app-region: drag;
      user-select: none;
    }
    .desktop-titlebar-drag-region {
      height: 100%;
      min-width: 0;
    }
    .desktop-window-controls {
      display: inline-flex;
      height: 100%;
      align-items: center;
      gap: 2px;
      padding-right: 2px;
      -webkit-app-region: no-drag;
    }
    .desktop-window-button {
      position: relative;
      display: inline-flex;
      width: 34px;
      height: 30px;
      align-items: center;
      justify-content: center;
      border: 1px solid transparent;
      border-radius: 7px;
      margin: 0;
      padding: 0;
      color: var(--text-secondary);
      background: transparent;
      font: inherit;
      cursor: pointer;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
      -webkit-app-region: no-drag;
    }
    .desktop-window-button:hover,
    .desktop-window-button:focus-visible {
      color: var(--text-primary);
      border-color: color-mix(in srgb, var(--border-active) 72%, transparent);
      background: color-mix(in srgb, var(--bg-active) 64%, transparent);
    }
    .desktop-window-button.close:hover,
    .desktop-window-button.close:focus-visible {
      color: #ffffff;
      border-color: transparent;
      background: var(--error);
    }
    .desktop-window-button .restore-icon {
      display: none;
    }
    .desktop-window-button.is-maximized .maximize-icon {
      display: none;
    }
    .desktop-window-button.is-maximized .restore-icon {
      display: block;
    }
    .status-main {
      display: grid;
      min-height: 0;
      place-items: center;
      padding: 48px 24px;
    }
    .status-content {
      display: grid;
      width: min(560px, calc(100vw - 48px));
      justify-items: center;
      text-align: center;
    }
    .status-logo {
      display: block;
      width: 84px;
      height: 84px;
      margin: 0 0 24px;
      object-fit: contain;
      transform-origin: center;
      animation:
        status-logo-arrive 420ms ease-out both,
        status-logo-breathe 2.6s ease-in-out 420ms infinite;
      filter:
        drop-shadow(0 0 18px color-mix(in srgb, var(--accent) 30%, transparent))
        drop-shadow(0 0 14px color-mix(in srgb, var(--warning) 14%, transparent));
    }
    h1 {
      margin: 0 0 12px;
      color: var(--text-primary);
      font-size: 24px;
      font-weight: 650;
      letter-spacing: 0;
      line-height: 1.2;
      text-align: center;
    }
    .status-detail {
      max-width: 520px;
      margin: 0;
      color: var(--text-secondary);
      font-size: 15px;
      line-height: 1.55;
      text-align: center;
      white-space: pre-wrap;
    }
    .status-gradient-text {
      color: transparent;
      background-image: linear-gradient(
        90deg,
        var(--text-secondary) 0%,
        var(--text-primary) 36%,
        var(--accent) 50%,
        var(--text-primary) 64%,
        var(--text-secondary) 100%
      );
      background-size: 240px 100%;
      background-position: 0 50%;
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: status-gradient-flow 4.8s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .status-logo,
      .status-gradient-text {
        animation: none;
      }
      .status-gradient-text {
        color: var(--text-secondary);
        background-image: none;
        -webkit-text-fill-color: var(--text-secondary);
      }
    }
  </style>
</head>
<body data-theme="${theme}">
  <div class="desktop-titlebar">
    <div class="desktop-titlebar-drag-region" aria-hidden="true"></div>
    <div class="desktop-window-controls">
      <button class="desktop-window-button" type="button" data-window-action="minimize" aria-label="Minimize" title="Minimize">${minimizeIcon}</button>
      <button class="desktop-window-button" type="button" data-window-action="maximize" aria-label="Maximize" title="Maximize"><span class="maximize-icon">${maximizeIcon}</span><span class="restore-icon">${restoreIcon}</span></button>
      <button class="desktop-window-button close" type="button" data-window-action="close" aria-label="Close" title="Close">${closeIcon}</button>
    </div>
  </div>
  <main class="status-main">
    <section class="status-content">
      ${logo}
      <h1>${escapeHtml(title)}</h1>
      <p class="status-detail status-gradient-text">${escapeHtml(detail)}</p>
    </section>
  </main>
  <script>
    const api = window.oratorioDesktop;
    const minimize = document.querySelector('[data-window-action="minimize"]');
    const maximize = document.querySelector('[data-window-action="maximize"]');
    const close = document.querySelector('[data-window-action="close"]');
    minimize?.addEventListener('click', () => api?.minimizeWindow());
    maximize?.addEventListener('click', () => api?.toggleMaximizeWindow());
    close?.addEventListener('click', () => api?.closeWindow());
    function syncWindowState(state) {
      if (!maximize || !state) return;
      const isMaximized = Boolean(state.isMaximized);
      const label = isMaximized ? 'Restore' : 'Maximize';
      maximize.classList.toggle('is-maximized', isMaximized);
      maximize.setAttribute('aria-label', label);
      maximize.setAttribute('title', label);
    }
    api?.getWindowState().then(syncWindowState).catch(() => {});
    api?.onWindowStateChanged(syncWindowState);
  </script>
</body>
</html>`
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function iconSvg(paths: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
