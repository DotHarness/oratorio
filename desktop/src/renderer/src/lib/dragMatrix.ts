import type { DragOutcome, TaskStatus, WorkItem } from './types'
import i18n from '../i18n'
import { taskStatusLabel } from './format'

export function resolveDrag(from: TaskStatus, to: TaskStatus, item?: Pick<WorkItem, 'state'>): DragOutcome {
  if (from === to) {
    return { kind: 'reorder' }
  }

  if (from === 'done') {
    return { kind: 'invalid', message: i18n.t('board:drag.doneNotReopen') }
  }

  if (from === 'todo' && to === 'in_progress') {
    return { kind: 'dispatch', undoMs: 8000 }
  }

  if (from === 'in_progress' && to === 'todo') {
    if (item?.state === 'dispatching' || item?.state === 'running') {
      return { kind: 'cancel-run' }
    }

    return { kind: 'invalid', message: i18n.t('board:drag.cancelRunNeedsActive') }
  }

  if (from === 'in_review' && to === 'done') {
    return { kind: 'approve', undoMs: 5000 }
  }

  if (from === 'in_review' && to === 'in_progress') {
    return { kind: 'request-changes', requiresComposer: true }
  }

  return { kind: 'invalid', message: i18n.t('board:drag.cannotMove', { from: taskStatusLabel(from), to: taskStatusLabel(to) }) }
}

export function dragOutcomeLabel(kind: DragOutcome['kind'], shortId: string) {
  if (kind === 'dispatch') return i18n.t('board:drag.dispatch', { name: shortId })
  if (kind === 'cancel-run') return i18n.t('board:drag.cancelRun', { name: shortId })
  if (kind === 'approve') return i18n.t('board:drag.approve', { name: shortId })
  if (kind === 'reject') return i18n.t('board:drag.reject', { name: shortId })
  if (kind === 'archive') return i18n.t('board:drag.archive', { name: shortId })
  if (kind === 'reopen') return i18n.t('board:drag.reopen', { name: shortId })
  if (kind === 'request-changes') return i18n.t('board:drag.requestChanges', { name: shortId })
  return i18n.t('board:drag.moved', { name: shortId })
}
