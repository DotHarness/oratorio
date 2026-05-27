import { taskStatusColumns } from './format'
import type { BoardEvent, ItemState, TaskStatus, WorkItem } from './types'

export function composeSortOrder(columnIndex: number, position: number) {
  return columnIndex * 1000 + position
}

export function columnIndexForStatus(status: TaskStatus) {
  return Math.max(0, taskStatusColumns.findIndex((column) => column.id === status))
}

export function sortItemsForBoard(items: WorkItem[]) {
  return [...items].sort((left, right) => {
    if (left.boardSortOrder !== right.boardSortOrder) {
      return left.boardSortOrder - right.boardSortOrder
    }

    return right.updated.localeCompare(left.updated)
  })
}

export function recomputeColumnOrders(items: WorkItem[], status: TaskStatus) {
  const columnIndex = columnIndexForStatus(status)
  return sortItemsForBoard(items).map((item, index) => ({
    taskId: item.itemId ?? item.id,
    sortOrder: composeSortOrder(columnIndex, index),
  }))
}

export function applyBoardEvent(items: WorkItem[], event: BoardEvent) {
  if (event.type === 'ping') {
    return items
  }

  if (event.type === 'task/removed') {
    return items.filter((item) => !matchesBoardEvent(item, event))
  }

  if (event.type !== 'task/updated') {
    return items
  }

  let changed = false
  const nextItems = items.map((item) => {
    if (!matchesBoardEvent(item, event)) {
      return item
    }

    changed = true
    const taskStatus = event.taskStatus ?? item.taskStatus
    return {
      ...item,
      taskStatus,
      state: stateFromBoardEvent(taskStatus, event.microStatus, item.state),
      boardSortOrder: event.boardSortOrder ?? item.boardSortOrder,
    }
  })

  return changed ? nextItems : items
}

function matchesBoardEvent(item: WorkItem, event: Pick<BoardEvent, 'taskId' | 'shortId'>) {
  return Boolean(
    (event.taskId && (item.itemId === event.taskId || item.id === event.taskId)) ||
    (event.shortId && item.shortId === event.shortId),
  )
}

function stateFromBoardEvent(status: TaskStatus, microStatus: BoardEvent['microStatus'], fallback: ItemState): ItemState {
  if (microStatus === 'error') return 'failed'
  if (status === 'todo') return 'discovered'
  if (status === 'in_progress') return fallback === 'running' ? 'running' : 'dispatching'
  if (status === 'in_review') return 'awaitingReview'
  if (status === 'done') return 'approved'
  return fallback === 'rejected' ? 'rejected' : 'archived'
}
