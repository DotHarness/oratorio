import { describe, expect, it } from 'vitest'
import { applyBoardEvent, columnIndexForStatus, composeSortOrder, recomputeColumnOrders } from '../sortOrder'
import type { WorkItem } from '../types'

describe('sort order helpers', () => {
  it('composes board sort order from column and position', () => {
    expect(composeSortOrder(0, 0)).toBe(0)
    expect(composeSortOrder(1, 0)).toBe(1000)
    expect(composeSortOrder(4, 17)).toBe(4017)
  })

  it('maps task statuses to board column indexes', () => {
    expect(columnIndexForStatus('todo')).toBe(0)
    expect(columnIndexForStatus('in_progress')).toBe(1)
    expect(columnIndexForStatus('in_review')).toBe(2)
    expect(columnIndexForStatus('done')).toBe(3)
    expect(columnIndexForStatus('cancelled')).toBe(4)
  })

  it('recomputes sort order for a column', () => {
    const items = [
      makeItem('b', 2),
      makeItem('a', 0),
      makeItem('c', 1),
    ]

    expect(recomputeColumnOrders(items, 'in_review')).toEqual([
      { taskId: 'a', sortOrder: 2000 },
      { taskId: 'c', sortOrder: 2001 },
      { taskId: 'b', sortOrder: 2002 },
    ])
  })

  it('applies task updated stream events to matching cards', () => {
    const items = [makeItem('item-1', 0), makeItem('item-2', 1)]

    const next = applyBoardEvent(items, {
      type: 'task/updated',
      taskId: 'item-1',
      shortId: 'DEF-1',
      taskStatus: 'in_progress',
      microStatus: 'running',
      boardSortOrder: 1000,
    })

    expect(next[0]).toMatchObject({ taskStatus: 'in_progress', state: 'dispatching', boardSortOrder: 1000 })
    expect(next[1]).toBe(items[1])
  })

  it('removes task cards from task removed stream events', () => {
    const items = [makeItem('item-1', 0), makeItem('item-2', 1)]

    expect(applyBoardEvent(items, { type: 'task/removed', taskId: 'item-2' }).map((item) => item.id)).toEqual(['item-1'])
  })

  it('ignores stream events for unknown tasks', () => {
    const items = [makeItem('item-1', 0)]

    expect(applyBoardEvent(items, { type: 'task/updated', taskId: 'missing', taskStatus: 'done' })).toBe(items)
  })
})

function makeItem(id: string, boardSortOrder: number): WorkItem {
  return {
    id,
    itemId: id,
    sourceKey: 'local',
    externalId: id,
    currentRunId: null,
    type: 'task',
    kind: 'localTask',
    number: id,
    title: id,
    description: '',
    repository: 'local',
    source: 'Local',
    state: 'discovered',
    shortId: id === 'item-1' ? 'DEF-1' : id,
    taskStatus: 'todo',
    boardSortOrder,
    assignee: 'operator',
    branch: 'main',
    updated: 'just now',
    sourceUpdated: null,
    lastSourceSync: null,
    sourceState: 'unknown',
    sourceClosedAt: null,
    sourceMergedAt: null,
    archiveReason: null,
    round: 0,
    severity: 'medium',
    check: 'notConfigured',
    summary: '',
    externalUrl: null,
    labels: [],
    isDraft: false,
    headSha: null,
    sourceSnapshot: null,
    comments: [],
    sourceComments: [],
    sourceWrites: [],
    reviewDrafts: [],
    implementationDrafts: [],
    followUpDrafts: [],
    rounds: [],
    decisions: [],
    runs: [],
    timeline: [],
    parentItemId: null,
    generatedFromDraftId: null,
  }
}
