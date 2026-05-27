// Capture preview screenshots of the Oratorio renderer against an isolated
// seeded backend. Prerequisites:
//   1. Backend running on http://127.0.0.1:5780 (seeded preview state in
//      .craft/preview/). See scripts/README or CLAUDE.md for the dotnet run
//      command.
//   2. Renderer Vite dev server running on http://127.0.0.1:5174 via
//      `cd desktop && npx vite --config vite.preview.config.ts`. Port 5174
//      is in the backend CORS allowlist.
//   3. Playwright + Chromium installed inside desktop/:
//        cd desktop && npm install --no-save playwright && npx playwright install chromium
//
// Output: PNGs are always written to .craft/preview/shots/ (gitignored, keeps
// numeric prefixes for ordering). If ORATORIO_RESOURCES_DIR is set, the same
// files are mirrored there with the numeric prefix stripped — the docs
// reference DotHarness/resources/raw/master/oratorio/<name>.png URLs, so
// pointing this env var at your local checkout of that repo and committing
// publishes the assets. Without the env var the mirror is skipped.

import { mkdir, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const desktopRequire = createRequire(resolve(here, '..', 'desktop', 'package.json'))
const { chromium } = desktopRequire('playwright')

const RENDERER = 'http://127.0.0.1:5174'
const BACKEND = 'http://127.0.0.1:5780'
const PRIMARY_OUT = resolve(here, '..', '.craft', 'preview', 'shots')
const RESOURCES_OUT = process.env.ORATORIO_RESOURCES_DIR ?? null

// Strip leading "<digits>-" so the resources repo keeps clean names alongside
// banner.png (e.g. "10-settings-projects-light.png" → "settings-projects-light.png").
const stripPrefix = (name) => name.replace(/^\d+-/, '')

const writeResources = RESOURCES_OUT !== null

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name, options = {}) {
  const primaryPath = resolve(PRIMARY_OUT, name)
  await page.screenshot({ path: primaryPath, fullPage: false, ...options })
  console.log('saved', primaryPath)
  if (writeResources) {
    const resourcesPath = resolve(RESOURCES_OUT, stripPrefix(name))
    await copyFile(primaryPath, resourcesPath)
    console.log('  → mirrored to', resourcesPath)
  }
}

async function safe(label, fn) {
  try {
    await fn()
  } catch (err) {
    console.log(`SKIP ${label}:`, err?.message ?? err)
  }
}

async function captureWithContext(browser, contextOptions, initScripts, fn) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    bypassCSP: true,
    ...contextOptions,
  })
  for (const script of initScripts) {
    await ctx.addInitScript(script)
  }
  const page = await ctx.newPage()
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text())
  })
  try {
    await fn(page)
  } finally {
    await ctx.close()
  }
}

async function main() {
  await mkdir(PRIMARY_OUT, { recursive: true })
  if (writeResources) await mkdir(RESOURCES_OUT, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  })

  // The launch overlay sticks in dev because React StrictMode double-invokes
  // the boot effect; hide it for board/drawer/settings shots so the surface
  // behind it is visible. The dedicated overlay capture below skips this.
  const hideLaunchOverlay = () => {
    const style = document.createElement('style')
    style.textContent = `.initial-launch-overlay { display: none !important; }`
    if (document.head) document.head.appendChild(style)
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  }

  // ── DARK SUITE ──────────────────────────────────────────────────────────
  await captureWithContext(browser, { colorScheme: 'dark' }, [hideLaunchOverlay], async (page) => {
    await page.goto(`${RENDERER}/?theme=dark`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.board-view', { timeout: 25000 }).catch((e) =>
      console.log('wait-board-error:', e.message),
    )
    await wait(1500)
    await shot(page, '01-board-dark.png')

    const tasks = await page.evaluate(
      async (backend) => {
        const r = await fetch(`${backend}/api/v1/tasks`)
        return r.json()
      },
      BACKEND,
    )
    console.log('seeded tasks:', tasks?.tasks?.map((t) => ({ id: t.itemId, short: t.shortId, title: t.title, state: t.state })))

    const awaiting = tasks?.tasks?.find((t) => t.state === 'awaitingReview') ?? tasks?.tasks?.[0]
    const approved = tasks?.tasks?.find((t) => t.state === 'approved')
    const running = tasks?.tasks?.find((t) => t.state === 'running' || t.state === 'dispatching')

    // Zoom in on a single board card
    await page.goto(`${RENDERER}/?theme=dark`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.board-view', { timeout: 15000 }).catch(() => {})
    await wait(800)
    const firstCard = page.locator('.board-view article, .task-card, [class*="card"]').first()
    if ((await firstCard.count()) > 0) {
      const box = await firstCard.boundingBox()
      if (box) {
        await page.screenshot({
          path: resolve(PRIMARY_OUT, '08-board-card-closeup.png'),
          clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: box.width + 32, height: box.height + 32 },
        })
        console.log('saved 08 closeup')
        if (writeResources) await copyFile(resolve(PRIMARY_OUT, '08-board-card-closeup.png'), resolve(RESOURCES_OUT, 'board-card-closeup.png'))
      }
    }
    const columnCloseup = await page.locator('.board-view').boundingBox()
    if (columnCloseup) {
      await page.screenshot({
        path: resolve(PRIMARY_OUT, '09-board-columns.png'),
        clip: { x: columnCloseup.x, y: columnCloseup.y, width: columnCloseup.width, height: Math.min(420, columnCloseup.height) },
      })
      console.log('saved 09 columns')
      if (writeResources) await copyFile(resolve(PRIMARY_OUT, '09-board-columns.png'), resolve(RESOURCES_OUT, 'board-columns.png'))
    }

    if (awaiting) {
      const taskRouteId = awaiting.shortId ?? awaiting.itemId
      await page.goto(`${RENDERER}/?theme=dark#/projects/default/tasks/${encodeURIComponent(taskRouteId)}`, { waitUntil: 'networkidle' })
      await wait(1800)
      await shot(page, '02-task-drawer-dark.png')

      for (const stage of ['intake', 'analysis', 'review', 'decision', 'closed']) {
        await page.goto(`${RENDERER}/?theme=dark#/projects/default/tasks/${encodeURIComponent(taskRouteId)}/detail/${stage}`, { waitUntil: 'networkidle' })
        await wait(1800)
        await shot(page, `04-task-detail-${stage}-dark.png`)
      }
    }

    if (approved) {
      await page.goto(`${RENDERER}/?theme=dark#/items/${approved.itemId}`, { waitUntil: 'networkidle' })
      await wait(1500)
      await shot(page, '05-approved-item-dark.png')
    }

    // Dispatch-in-progress drawer: drawer view for a running task (no /detail
    // suffix so it stays as the compact status drawer, not the full detail).
    if (running) {
      await safe('dispatch-running-drawer', async () => {
        const id = running.shortId ?? running.itemId
        await page.goto(`${RENDERER}/?theme=dark#/projects/default/tasks/${encodeURIComponent(id)}`, { waitUntil: 'networkidle' })
        await wait(1500)
        await shot(page, '20-dispatch-in-progress-dark.png')
      })
    }

    // Settings sections — dark for Agents (DotCraft connection) and Sources.
    for (const [section, name] of [
      ['agents', '12-settings-agents-dark.png'],
      ['sources', '13-settings-sources-dark.png'],
    ]) {
      await safe(`settings-${section}-dark`, async () => {
        await page.goto(`${RENDERER}/?theme=dark#/settings/${section}`, { waitUntil: 'networkidle' })
        await page.waitForSelector('.settings-main-panel', { timeout: 8000 }).catch(() => {})
        await wait(1200)
        await shot(page, name)
      })
    }
  })

  // ── LIGHT SUITE ─────────────────────────────────────────────────────────
  await captureWithContext(browser, { colorScheme: 'light' }, [hideLaunchOverlay], async (page) => {
    await page.goto(`${RENDERER}/?theme=light`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.board-view', { timeout: 15000 }).catch(() => {})
    await wait(1500)
    await shot(page, '06-board-light.png')

    const tasks = await page.evaluate(
      async (backend) => {
        const r = await fetch(`${backend}/api/v1/tasks`)
        return r.json()
      },
      BACKEND,
    )
    const awaiting = tasks?.tasks?.find((t) => t.state === 'awaitingReview') ?? tasks?.tasks?.[0]

    if (awaiting) {
      const id = awaiting.shortId ?? awaiting.itemId
      await page.goto(`${RENDERER}/?theme=light#/projects/default/tasks/${encodeURIComponent(id)}/detail/decision`, { waitUntil: 'networkidle' })
      await wait(1800)
      await shot(page, '07-task-detail-decision-light.png')

      // Light-theme intake stage — used as the "create your first task" shot.
      await page.goto(`${RENDERER}/?theme=light#/projects/default/tasks/${encodeURIComponent(id)}/detail/intake`, { waitUntil: 'networkidle' })
      await wait(1500)
      await shot(page, '15-task-detail-intake-light.png')
    }

    // Settings — light shots for Projects (workspace mapping) and Credentials
    // (GitHub / GitLab token presence). These are the two surfaces Getting
    // Started walks through, so light is the right default.
    for (const [section, name] of [
      ['projects', '10-settings-projects-light.png'],
      ['credentials', '11-settings-credentials-light.png'],
      ['general', '14-settings-general-light.png'],
    ]) {
      await safe(`settings-${section}-light`, async () => {
        await page.goto(`${RENDERER}/?theme=light#/settings/${section}`, { waitUntil: 'networkidle' })
        await page.waitForSelector('.settings-main-panel', { timeout: 8000 }).catch(() => {})
        await wait(1200)
        await shot(page, name)
      })
    }

    // Local task creation dialog — open via the "New local task" toolbar
    // button. Falls back silently if the trigger isn't on the current view.
    await safe('create-task-dialog-light', async () => {
      await page.goto(`${RENDERER}/?theme=light`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.board-view', { timeout: 8000 }).catch(() => {})
      await wait(800)
      const trigger = page.locator('[aria-label="New local task"]').first()
      if ((await trigger.count()) === 0) throw new Error('"New local task" trigger not found on the board view')
      await trigger.click()
      await page.waitForSelector('.local-task-form-dialog, [role="dialog"]', { timeout: 6000 })
      await wait(700)
      await shot(page, '16-create-task-dialog-light.png')
    })
  })

  // ── LAUNCH OVERLAY (must NOT inject the hide-overlay init script) ───────
  for (const theme of ['light', 'dark']) {
    await captureWithContext(browser, { colorScheme: theme }, [], async (page) => {
      await safe(`launch-overlay-${theme}`, async () => {
        await page.goto(`${RENDERER}/?theme=${theme}`, { waitUntil: 'domcontentloaded' })
        // The overlay appears immediately on first paint. Wait briefly so the
        // breathing logo settles into a visible frame.
        await page.waitForSelector('.initial-launch-overlay', { timeout: 6000 })
        await wait(900)
        await shot(page, `17-launch-overlay-${theme}.png`)
      })
    })
  }

  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
