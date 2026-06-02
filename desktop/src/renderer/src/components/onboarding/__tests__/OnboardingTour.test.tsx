import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTour } from '../OnboardingTour'
import {
  markOnboardingSeen,
  onboardingSeenVersionStorageKey,
  onboardingSteps,
  shouldShowOnboarding,
} from '../../../lib/onboarding'

function renderTour() {
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <OnboardingTour onClose={onClose} />
    </MemoryRouter>,
  )
  return { onClose }
}

describe('OnboardingTour', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('opens on the welcome step as a centered card', () => {
    renderTour()
    expect(screen.getByText('Welcome to Oratorio')).toBeInTheDocument()
    expect(screen.getByText(`Step 1 of ${onboardingSteps.length}`)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveClass('is-card')
  })

  it('advances to the next step with Next', () => {
    renderTour()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('The rhythm of the board')).toBeInTheDocument()
    expect(screen.getByText(`Step 2 of ${onboardingSteps.length}`)).toBeInTheDocument()
  })

  it('dismisses via the close button', () => {
    const { onClose } = renderTour()
    fireEvent.click(screen.getByRole('button', { name: 'Close tour' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('dismisses via Skip tour', () => {
    const { onClose } = renderTour()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('finishes on the last step with Get started', () => {
    const { onClose } = renderTour()
    for (let step = 0; step < onboardingSteps.length - 1; step += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.queryByRole('button', { name: 'Skip tour' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('onboarding persistence', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('shows the tour until the current version is marked seen', () => {
    expect(shouldShowOnboarding()).toBe(true)
    markOnboardingSeen()
    expect(shouldShowOnboarding()).toBe(false)
    expect(window.localStorage.getItem(onboardingSeenVersionStorageKey)).toBe('1')
  })

  it('shows the tour again when a stale version was seen', () => {
    window.localStorage.setItem(onboardingSeenVersionStorageKey, '0')
    expect(shouldShowOnboarding()).toBe(true)
  })
})
