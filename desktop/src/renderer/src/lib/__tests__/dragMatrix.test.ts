import { describe, expect, it } from 'vitest'
import { resolveDrag } from '../dragMatrix'
import type { DragOutcomeKind, TaskStatus } from '../types'

describe('resolveDrag', () => {
  it.each([
    ['todo', 'todo', 'reorder', undefined],
    ['todo', 'in_progress', 'dispatch', 8000],
    ['in_progress', 'todo', 'invalid', undefined],
    ['in_review', 'done', 'approve', 5000],
    ['in_review', 'in_progress', 'request-changes', undefined],
    ['in_review', 'cancelled', 'invalid', undefined],
    ['todo', 'cancelled', 'invalid', undefined],
    ['in_progress', 'cancelled', 'invalid', undefined],
    ['cancelled', 'todo', 'invalid', undefined],
    ['done', 'todo', 'invalid', undefined],
    ['done', 'in_progress', 'invalid', undefined],
    ['cancelled', 'in_progress', 'invalid', undefined],
  ] satisfies Array<[TaskStatus, TaskStatus, DragOutcomeKind, number | undefined]>)(
    'maps %s -> %s to %s',
    (from, to, expectedKind, expectedUndoMs) => {
      const outcome = resolveDrag(from, to)

      expect(outcome.kind).toBe(expectedKind)
      expect(outcome.undoMs).toBe(expectedUndoMs)
    },
  )

  it.each([
    ['dispatching'],
    ['running'],
  ] as const)('maps active in progress %s tasks back to todo cancellation', (state) => {
    const outcome = resolveDrag('in_progress', 'todo', { state })

    expect(outcome.kind).toBe('cancel-run')
  })

  it('rejects failed in progress tasks dragged back to todo', () => {
    expect(resolveDrag('in_progress', 'todo', { state: 'failed' })).toMatchObject({
      kind: 'invalid',
    })
  })

  it('requires feedback composer for request changes', () => {
    expect(resolveDrag('in_review', 'in_progress')).toMatchObject({
      kind: 'request-changes',
      requiresComposer: true,
    })
  })
})
