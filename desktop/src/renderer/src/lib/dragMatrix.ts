import type { DragOutcome, TaskStatus } from './types'

export function resolveDrag(from: TaskStatus, to: TaskStatus): DragOutcome {
  if (from === to) {
    return { kind: 'reorder' }
  }

  if (from === 'done') {
    return { kind: 'invalid', message: 'Done tasks cannot be reopened by dragging.' }
  }

  if (from === 'todo' && to === 'in_progress') {
    return { kind: 'dispatch', undoMs: 8000 }
  }

  if (from === 'in_review' && to === 'done') {
    return { kind: 'approve', undoMs: 5000 }
  }

  if (from === 'in_review' && to === 'in_progress') {
    return { kind: 'request-changes', requiresComposer: true }
  }

  return { kind: 'invalid', message: `Cannot move from ${from} to ${to}.` }
}

export function dragOutcomeLabel(kind: DragOutcome['kind'], shortId: string) {
  if (kind === 'dispatch') return `Dispatching ${shortId}.`
  if (kind === 'approve') return `Approved ${shortId}.`
  if (kind === 'reject') return `Rejected ${shortId}.`
  if (kind === 'archive') return `Archived ${shortId}.`
  if (kind === 'reopen') return `Reopened ${shortId}.`
  if (kind === 'request-changes') return `Requesting changes for ${shortId}.`
  return `Moved ${shortId}.`
}
