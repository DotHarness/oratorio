import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DropResult } from '@hello-pangea/dnd'
import { apiPost } from '../api'
import i18n from '../i18n'
import type { ItemDetailResponse, MockOutcome, RunnerMode, TaskStatus, WorkItem } from '../lib/types'
import { detailToWorkItem, errorMessage, itemUrl, sourceItemUrl, taskStatusLabel } from '../lib/format'
import { dragOutcomeLabel, resolveDrag } from '../lib/dragMatrix'
import { columnIndexForStatus, composeSortOrder, sortItemsForBoard } from '../lib/sortOrder'
import type { RequestChangesValue } from '../components/board/RequestChangesModal'
import type { UndoToastEntry } from '../components/board/UndoToastHost'

type NoticeTone = 'success' | 'error' | 'info'

type PendingComposer = {
  item: WorkItem
  fromStatus: TaskStatus
  toStatus: TaskStatus
  toIndex: number
}

export type BoardCommander = {
  boardItems: WorkItem[]
  undoToasts: UndoToastEntry[]
  pendingComposer: PendingComposer | null
  composerBusy: boolean
  composerError: string | null
  liveMessage: string
  handleDragEnd: (result: DropResult) => void
  cancelRequestChanges: () => void
  submitRequestChanges: (value: RequestChangesValue) => Promise<void>
}

export function useBoardCommander({
  items,
  runnerMode,
  mockOutcome,
  refreshAll,
  notify,
}: {
  items: WorkItem[]
  runnerMode: RunnerMode
  mockOutcome: MockOutcome
  refreshAll: () => Promise<void>
  notify: (message: string, tone?: NoticeTone) => void
}): BoardCommander {
  const [boardItems, setBoardItems] = useState(() => sortItemsForBoard(items))
  const [undoToasts, setUndoToasts] = useState<UndoToastEntry[]>([])
  const [pendingComposer, setPendingComposer] = useState<PendingComposer | null>(null)
  const [composerBusy, setComposerBusy] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [liveMessage, setLiveMessage] = useState('')
  const boardItemsRef = useRef(boardItems)
  const pendingCommitsRef = useRef(new Map<string, () => Promise<void>>())

  useEffect(() => {
    if (pendingCommitsRef.current.size > 0) {
      return
    }

    setBoardItems(sortItemsForBoard(items))
  }, [items])

  useEffect(() => {
    boardItemsRef.current = boardItems
  }, [boardItems])

  const removeToast = useCallback((toastId: string) => {
    pendingCommitsRef.current.delete(toastId)
    setUndoToasts((current) => current.filter((toast) => toast.id !== toastId))
  }, [])

  const persistOrders = useCallback(async (nextItems: WorkItem[]) => {
    await apiPost('/tasks/reorder', {
      updates: nextItems.map((item) => ({
        taskId: item.itemId ?? item.id,
        sortOrder: item.boardSortOrder,
      })),
    })
  }, [])

  const commitAction = useCallback(
    async (item: WorkItem, outcome: ReturnType<typeof resolveDrag>) => {
      if (outcome.kind === 'dispatch') {
        await postItemAction(item, '/dispatch', dispatchBody(runnerMode, mockOutcome))
      } else if (outcome.kind === 'approve') {
        await postItemAction(item, '/approve', { body: 'Approved from the board.' })
      } else if (outcome.kind === 'reject') {
        await postItemAction(item, '/reject', { body: 'Rejected from the board.' })
      } else if (outcome.kind === 'archive') {
        await postItemAction(item, '/archive', {})
      } else if (outcome.kind === 'reopen') {
        await postItemAction(item, '/reopen', { body: 'Reopened from the board.' })
      }

      await persistOrders(boardItemsRef.current)
      await refreshAll()
    },
    [mockOutcome, persistOrders, refreshAll, runnerMode],
  )

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) {
        return
      }

      const fromStatus = result.source.droppableId as TaskStatus
      const toStatus = result.destination.droppableId as TaskStatus
      const item = boardItemsRef.current.find((candidate) => candidate.id === result.draggableId)
      if (!item) {
        return
      }

      const outcome = resolveDrag(fromStatus, toStatus)
      if (outcome.kind === 'invalid') {
        const message = outcome.message ?? i18n.t('board:drag.notAvailable')
        setLiveMessage(message)
        notify(message, 'error')
        return
      }

      if (outcome.kind === 'request-changes') {
        setPendingComposer({ item, fromStatus, toStatus, toIndex: result.destination.index })
        setComposerError(null)
        setLiveMessage(i18n.t('board:drag.addFeedbackBefore', { name: item.shortId ?? item.title }))
        return
      }

      const previousItems = boardItemsRef.current
      const nextItems = moveBoardItem(previousItems, item.id, fromStatus, toStatus, result.destination.index)
      setBoardItems(nextItems)
      setLiveMessage(i18n.t('board:drag.movedTo', { name: item.shortId ?? item.title, status: taskStatusLabel(toStatus) }))

      if (outcome.kind === 'reorder') {
        void persistOrders(nextItems).catch((reason) => {
          setBoardItems(previousItems)
          notify(errorMessage(reason), 'error')
        })
        return
      }

      if (outcome.kind === 'reopen') {
        void commitAction(item, outcome).then(
          () => notify(dragOutcomeLabel(outcome.kind, item.shortId ?? item.number)),
          (reason) => {
            setBoardItems(previousItems)
            notify(errorMessage(reason), 'error')
          },
        )
        return
      }

      const toastId = `${item.id}-${Date.now()}`
      const undoMs = outcome.undoMs ?? 5000
      const label = dragOutcomeLabel(outcome.kind, item.shortId ?? item.number)
      const commit = async () => {
        removeToast(toastId)
        try {
          await commitAction(item, outcome)
          notify(label)
        } catch (reason) {
          setBoardItems(previousItems)
          notify(errorMessage(reason), 'error')
        }
      }
      pendingCommitsRef.current.set(toastId, commit)
      setUndoToasts((current) => [
        ...current,
        {
          id: toastId,
          label,
          durationMs: undoMs,
          createdAt: Date.now(),
          onUndo: () => {
            setBoardItems(previousItems)
            removeToast(toastId)
            setLiveMessage(i18n.t('board:drag.moveUndone', { name: item.shortId ?? item.title }))
          },
          onCommit: () => {
            void commit()
          },
        },
      ])
    },
    [commitAction, notify, persistOrders, removeToast],
  )

  useEffect(() => {
    function flushPending() {
      for (const commit of pendingCommitsRef.current.values()) {
        void commit()
      }
    }

    window.addEventListener('beforeunload', flushPending)
    return () => window.removeEventListener('beforeunload', flushPending)
  }, [])

  const cancelRequestChanges = useCallback(() => {
    setPendingComposer(null)
    setComposerError(null)
  }, [])

  const submitRequestChanges = useCallback(
    async (value: RequestChangesValue) => {
      if (!pendingComposer) {
        return
      }

      setComposerBusy(true)
      setComposerError(null)
      try {
        const body = value.severity === 'red' ? `[blocking] ${value.body}` : value.body
        await postItemAction(pendingComposer.item, '/request-changes', { body })
        setPendingComposer(null)
        notify(i18n.t('board:drag.changesRequested', { name: pendingComposer.item.shortId ?? pendingComposer.item.number }))
        await refreshAll()
      } catch (reason) {
        setComposerError(errorMessage(reason))
      } finally {
        setComposerBusy(false)
      }
    },
    [notify, pendingComposer, refreshAll],
  )

  return useMemo(
    () => ({
      boardItems,
      undoToasts,
      pendingComposer,
      composerBusy,
      composerError,
      liveMessage,
      handleDragEnd,
      cancelRequestChanges,
      submitRequestChanges,
    }),
    [boardItems, cancelRequestChanges, composerBusy, composerError, handleDragEnd, liveMessage, pendingComposer, submitRequestChanges, undoToasts],
  )
}

function moveBoardItem(items: WorkItem[], itemId: string, fromStatus: TaskStatus, toStatus: TaskStatus, destinationIndex: number) {
  const withoutItem = items.filter((item) => item.id !== itemId)
  const moving = items.find((item) => item.id === itemId)
  if (!moving) {
    return items
  }

  const targetColumn = sortItemsForBoard(withoutItem.filter((item) => item.taskStatus === toStatus))
  targetColumn.splice(destinationIndex, 0, { ...moving, taskStatus: toStatus })

  const affectedStatuses = new Set<TaskStatus>([fromStatus, toStatus])
  const updated = new Map<string, WorkItem>()
  for (const status of affectedStatuses) {
    const columnItems = status === toStatus ? targetColumn : sortItemsForBoard(withoutItem.filter((item) => item.taskStatus === status))
    const columnIndex = columnIndexForStatus(status)
    columnItems.forEach((item, index) => {
      updated.set(item.id, { ...item, boardSortOrder: composeSortOrder(columnIndex, index) })
    })
  }

  return sortItemsForBoard(withoutItem.map((item) => updated.get(item.id) ?? item).concat(targetColumn.filter((item) => item.id === itemId).map((item) => updated.get(item.id) ?? item)))
}

async function postItemAction(item: WorkItem, path: string, body: object) {
  if (item.itemId) {
    return apiPost<ItemDetailResponse>(`${itemUrl(item)}${path}`, body).then(detailToWorkItem)
  }

  return apiPost<ItemDetailResponse>(`${sourceItemUrl(item)}${path}`, body).then(detailToWorkItem)
}

function dispatchBody(runnerMode: RunnerMode, mockOutcome: MockOutcome) {
  if (runnerMode === 'mock') {
    return {
      mode: 'mock',
      mockOutcome,
      mockDurationSeconds: 8,
      note: 'Operator dispatched a validation round from the board.',
    }
  }

  return {
    mode: 'appServer',
    note: 'Operator dispatched a DotCraft analysis round from the board.',
  }
}
