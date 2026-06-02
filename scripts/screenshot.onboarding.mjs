// Capture the onboarding quick-start tour, step by step, against the renderer
// preview server. In dev/preview React StrictMode double-invokes the boot
// effect so the launch overlay sticks and initialLaunchPhase never reaches
// "ready" — so we (a) hide the launch overlay via CSS and (b) open the tour the
// supported way: Settings → General → "Replay tour" (independent of launch
// phase). Prereqs: `npx vite --config vite.preview.config.ts --port 5177` in
// desktop and Playwright installed. Output → .craft/preview/shots/onboarding-*.png.

import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const desktopRequire = createRequire(resolve(here, '..', 'desktop', 'package.json'))
const { chromium } = desktopRequire('playwright')

const RENDERER = process.env.ONBOARDING_PREVIEW_URL ?? 'http://127.0.0.1:5177'
const OUT = resolve(here, '..', '.craft', 'preview', 'shots')
const STEPS = ['welcome', 'columns', 'connectProject', 'credentials', 'newTask', 'handOff', 'review', 'next']
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const hideLaunchOverlay = () => {
  const style = document.createElement('style')
  style.textContent = `.initial-launch-overlay { display: none !important; }`
  if (document.head) document.head.appendChild(style)
  else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
}

async function captureSuite(browser, theme) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    bypassCSP: true,
    colorScheme: theme,
  })
  await ctx.addInitScript(hideLaunchOverlay)
  const page = await ctx.newPage()
  page.on('pageerror', (err) => console.log(`[${theme}] PAGE ERROR:`, err.message))

  // Open the tour via the Settings replay control (works regardless of launch phase).
  await page.goto(`${RENDERER}/?theme=${theme}#/settings/general`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.settings-main-panel', { timeout: 25000 }).catch((e) => console.log(`[${theme}] no settings:`, e.message))
  await wait(600)
  await page.getByRole('button', { name: 'Replay tour', exact: true }).click({ timeout: 15000 })
  await page.waitForSelector('.onboarding-overlay', { timeout: 15000 })

  for (let i = 0; i < STEPS.length; i += 1) {
    await wait(1900) // let the spotlight settle and remote images load
    const n = String(i + 1).padStart(2, '0')
    const name = `onboarding-${theme}-${n}-${STEPS[i]}.png`
    await page.screenshot({ path: resolve(OUT, name) })
    console.log('saved', name)

    if (i < STEPS.length - 1) {
      await page
        .getByRole('button', { name: 'Next', exact: true })
        .click({ timeout: 8000 })
        .catch((e) => console.log(`[${theme}] next click failed at ${STEPS[i]}:`, e.message.split('\n')[0]))
    }
  }

  await ctx.close()
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  })
  for (const theme of ['dark', 'light']) {
    await captureSuite(browser, theme)
  }
  await browser.close()
  console.log('done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
