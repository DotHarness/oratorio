import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UndoToastHost, type UndoToastEntry } from '../UndoToastHost'

describe('UndoToastHost', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('commits when the undo window expires', () => {
    const onCommit = vi.fn()
    render(<UndoToastHost toasts={[makeToast({ onCommit })]} />)

    vi.advanceTimersByTime(5000)

    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('runs undo when the undo button is clicked', () => {
    const onUndo = vi.fn()
    render(<UndoToastHost toasts={[makeToast({ onUndo })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('supports keyboard undo shortcuts', () => {
    const onUndo = vi.fn()
    render(<UndoToastHost toasts={[makeToast({ onUndo })]} />)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('keeps progress static for reduced motion', () => {
    render(<UndoToastHost toasts={[makeToast({})]} />)

    expect(document.querySelector('.undo-toast-progress.reduced-motion')).toBeInTheDocument()
  })
})

function makeToast(overrides: Partial<UndoToastEntry>): UndoToastEntry {
  return {
    id: 'toast-1',
    label: 'Archived DEF-1.',
    durationMs: 5000,
    createdAt: Date.now(),
    onUndo: vi.fn(),
    onCommit: vi.fn(),
    ...overrides,
  }
}
