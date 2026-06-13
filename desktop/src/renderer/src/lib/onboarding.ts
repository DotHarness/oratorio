// First-run "quick start" tour. Copy lives in the `onboarding` i18n namespace
// (en + zh-CN); illustration images are pulled from the shared resources repo at
// runtime so they are never bundled with the app. See specs + docs/getting-started.md.

export const onboardingSeenVersionStorageKey = 'oratorio.onboarding.seenVersion'

// Bump when the tour content changes enough that previous users should see it again.
export const onboardingVersion = 1

// Same remotely-hosted screenshots the documentation uses. Not bundled.
export const onboardingImageBase = 'https://github.com/DotHarness/resources/raw/master/oratorio/'

const dotcraftSetupUrl = 'https://www.dotcraft.net/getting-started'
const oratorioGuideUrl = 'https://dotharness.github.io/oratorio/getting-started'

// The board route the spotlight steps need. Matches AppShell's default redirect.
const boardRoute = '/projects/default'

// CTAs only ever open an external doc in the browser. In-app navigation broke
// the tour flow (the spotlight could not reconnect after the route change), so
// steps that point into Settings just say so in their body copy instead.
export type OnboardingCta = { target: string }

export type OnboardingStepPlacement = 'top' | 'bottom' | 'left' | 'right'

export type OnboardingStep = {
  /** Stable id; also the i18n key under `onboarding:steps.<id>`. */
  id: string
  /** CSS selector for the live element to spotlight. Absent → centered card. */
  target?: string
  /** Route to ensure before measuring a spotlight target. */
  route?: string
  /** Preferred side for the bubble relative to the target. */
  placement?: OnboardingStepPlacement
  /** Remote screenshot filename (resolved against onboardingImageBase). */
  image?: string
  /** Optional secondary action rendered next to Next. */
  cta?: OnboardingCta
}

export const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    image: 'board-light.png',
    cta: { target: dotcraftSetupUrl },
  },
  {
    id: 'columns',
    target: '[data-tour="board-columns"]',
    route: boardRoute,
    placement: 'bottom',
  },
  {
    id: 'connectProject',
    target: '[data-tour="settings-gear"]',
    route: boardRoute,
    placement: 'bottom',
  },
  {
    id: 'credentials',
    image: 'settings-credentials-light.png',
  },
  {
    id: 'newTask',
    target: '[data-tour="new-task"]',
    route: boardRoute,
    placement: 'bottom',
  },
  {
    id: 'handOff',
    target: '[data-tour="board-column-in_progress"]',
    route: boardRoute,
    placement: 'bottom',
  },
  {
    id: 'review',
    image: 'task-detail-review-dark.png',
  },
  {
    id: 'next',
    cta: { target: oratorioGuideUrl },
  },
]

function readSeenVersion(): number {
  if (typeof window === 'undefined') {
    return Number.POSITIVE_INFINITY
  }

  const stored = window.localStorage.getItem(onboardingSeenVersionStorageKey)
  if (stored === null) {
    return 0
  }

  const parsed = Number.parseInt(stored, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** True when the user has not yet completed the current tour version. */
export function shouldShowOnboarding(): boolean {
  return readSeenVersion() < onboardingVersion
}

/** Records that the current tour version has been seen (completed or skipped). */
export function markOnboardingSeen(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(onboardingSeenVersionStorageKey, String(onboardingVersion))
}
