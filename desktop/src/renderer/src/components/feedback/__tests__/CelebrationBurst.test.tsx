import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CelebrationBurst } from '../CelebrationBurst'

describe('CelebrationBurst', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders motion particles when reduced motion is not requested', () => {
    stubMatchMedia(false)

    render(<CelebrationBurst origin={{ x: 120, y: 240 }} />)

    expect(document.querySelectorAll('.celebration-particle')).toHaveLength(12)
    expect(document.querySelector('.celebration-burst')).toHaveStyle({ left: '120px', top: '240px' })
  })

  it('does not render motion particles for reduced-motion users', () => {
    stubMatchMedia(true)

    render(<CelebrationBurst origin={{ x: 120, y: 240 }} />)

    expect(document.querySelectorAll('.celebration-particle')).toHaveLength(0)
    expect(document.querySelector('.celebration-burst--reduced')).toBeInTheDocument()
  })
})

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}
