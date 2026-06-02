import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { DropResult } from '@hello-pangea/dnd'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardView, type BoardViewTestApi } from '../BoardView'
import type { GitHubSourceStatus, GitHubSyncJob, TaskStatus, WorkItem } from '../../lib/types'

function makeItem(overrides: Partial<WorkItem> & { id: string; title: string; shortId: string; taskStatus: TaskStatus }): WorkItem {
  return {
    id: overrides.id,
    itemId: overrides.itemId ?? overrides.id,
    sourceKey: overrides.sourceKey ?? 'local',
    externalId: overrides.externalId ?? overrides.id,
    currentRunId: overrides.currentRunId ?? null,
    type: overrides.type ?? 'task',
    kind: overrides.kind ?? 'localTask',
    number: overrides.number ?? overrides.shortId,
    title: overrides.title,
    description: overrides.description ?? 'A task description.',
    repository: overrides.repository ?? 'example-owner/oratorio',
    source: overrides.source ?? 'Local',
    state: overrides.state ?? 'discovered',
    shortId: overrides.shortId,
    taskStatus: overrides.taskStatus,
    boardSortOrder: overrides.boardSortOrder ?? 0,
    assignee: overrides.assignee ?? 'operator',
    branch: overrides.branch ?? 'main',
    updated: overrides.updated ?? 'just now',
    sourceUpdated: null,
    lastSourceSync: null,
    sourceState: 'unknown',
    sourceClosedAt: null,
    sourceMergedAt: null,
    archiveReason: null,
    round: 0,
    severity: 'medium',
    check: overrides.check ?? 'notConfigured',
    summary: overrides.summary ?? 'No agent summary is available yet.',
    externalUrl: null,
    labels: overrides.labels ?? ['frontend'],
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

describe('BoardView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(detailResponse(makeItem({
      id: 'updated',
      title: 'Updated task',
      shortId: 'DEF-9',
      taskStatus: 'in_progress',
      state: 'dispatching',
    }))), { status: 200 })))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders four active task status columns with counts and short ids', () => {
    const items = [
      makeItem({ id: 'todo-1', title: 'Write task projection', shortId: 'DEF-1', taskStatus: 'todo' }),
      makeItem({ id: 'running-1', title: 'Run implementation', shortId: 'DEF-2', taskStatus: 'in_progress', state: 'running' }),
      makeItem({ id: 'review-1', title: 'Review generated patch', shortId: 'DEF-3', taskStatus: 'in_review', state: 'awaitingReview' }),
      makeItem({ id: 'done-1', title: 'Ship docs', shortId: 'DEF-4', taskStatus: 'done', state: 'approved' }),
      makeItem({ id: 'cancelled-1', title: 'Archive stale task', shortId: 'DEF-5', taskStatus: 'cancelled', state: 'archived' }),
    ]
    const openSettings = vi.fn()

    renderBoard(items, { selectedItem: items[2], openSettings })

    expect(screen.getByRole('heading', { name: 'Oratorio' })).toBeInTheDocument()
    expect(screen.queryByText('Kanban')).not.toBeInTheDocument()
    expect(screen.queryByText('Project board')).not.toBeInTheDocument()
    expect(screen.queryByText(/Track work across/)).not.toBeInTheDocument()
    const repositoryFilter = screen.getByRole('button', { name: 'Repository filter' })
    expect(repositoryFilter).toHaveTextContent('All repositories')
    expect(repositoryFilter.parentElement).toHaveClass('select-control')
    expect(repositoryFilter.parentElement?.firstElementChild).toBe(repositoryFilter)
    expect(screen.getByRole('button', { name: 'Assignee' })).toHaveTextContent('All assignees')
    expect(screen.queryByRole('button', { name: 'Source' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Label' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(openSettings).toHaveBeenCalledOnce()

    for (const label of ['To do', 'In progress', 'In review', 'Done']) {
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('region', { name: 'Cancelled' })).not.toBeInTheDocument()
    expect(screen.queryByText('Archive stale task')).not.toBeInTheDocument()

    const reviewColumn = screen.getByRole('region', { name: 'In review' })
    expect(within(reviewColumn).getByText('Review generated patch')).toBeInTheDocument()
    expect(reviewColumn.querySelector('[data-task-card="DEF-3"]')).toBeInTheDocument()
    expect(within(reviewColumn).getByText('1')).toBeInTheDocument()
  })

  it('opens the selected task when a card is clicked', () => {
    const openItemFromQueue = vi.fn()
    const item = makeItem({ id: 'todo-1', itemId: 'item-1', title: 'Open this task', shortId: 'DEF-3', taskStatus: 'todo' })

    renderBoard([item], { openItemFromQueue })

    fireEvent.click(screen.getByRole('button', { name: /Open this task/ }))

    expect(openItemFromQueue).toHaveBeenCalledWith(item)
  })

  it('starts a GitHub pull from the toolbar', () => {
    const syncGitHubSource = vi.fn(async () => undefined)
    const item = makeItem({ id: 'todo-1', title: 'Pull this board', shortId: 'DEF-3', taskStatus: 'todo' })

    renderBoard([item], { syncGitHubSource })

    fireEvent.click(screen.getByRole('button', { name: 'Pull GitHub' }))

    expect(syncGitHubSource).toHaveBeenCalledOnce()
  })

  it('disables the GitHub pull button while sync is active', () => {
    const syncGitHubSource = vi.fn(async () => undefined)
    const item = makeItem({ id: 'todo-1', title: 'Pull this board', shortId: 'DEF-3', taskStatus: 'todo' })

    renderBoard([item], { syncGitHubSource, githubSyncJob: activeGitHubSyncJob })

    expect(screen.getByRole('button', { name: 'Pulling GitHub' })).toBeDisabled()
    expect(syncGitHubSource).not.toHaveBeenCalled()
  })

  it('filters tasks with source and label search qualifiers', () => {
    const matching = makeItem({
      id: 'github-frontend',
      title: 'Review generated patch',
      shortId: 'DEF-7',
      taskStatus: 'todo',
      sourceKey: 'github',
      source: 'GitHub',
      labels: ['frontend'],
    })
    const wrongSource = makeItem({
      id: 'local-frontend',
      title: 'Review local patch',
      shortId: 'DEF-8',
      taskStatus: 'todo',
      sourceKey: 'local',
      source: 'Local',
      labels: ['frontend'],
    })
    const wrongLabel = makeItem({
      id: 'github-backend',
      title: 'Review backend patch',
      shortId: 'DEF-9',
      taskStatus: 'todo',
      sourceKey: 'github',
      source: 'GitHub',
      labels: ['backend'],
    })

    renderBoard([matching, wrongSource, wrongLabel], { query: 's:github l:frontend review' })

    expect(screen.getByText('Review generated patch')).toBeInTheDocument()
    expect(screen.queryByText('Review local patch')).not.toBeInTheDocument()
    expect(screen.queryByText('Review backend patch')).not.toBeInTheDocument()
  })

  it('uses the shared tooltip primitive for the board search help', () => {
    const item = makeItem({ id: 'todo-1', title: 'Searchable task', shortId: 'DEF-3', taskStatus: 'todo' })

    renderBoard([item])

    const searchBox = screen.getByLabelText('Search tasks').closest('.board-search') as HTMLElement
    expect(searchBox).not.toHaveAttribute('title')

    fireEvent.pointerEnter(searchBox)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Advanced search supports')
  })

  it('buffers todo to in progress dispatch until the undo window expires', async () => {
    const fetchMock = vi.mocked(fetch)
    const item = makeItem({ id: 'todo-1', itemId: 'item-1', title: 'Dispatch this task', shortId: 'DEF-1', taskStatus: 'todo' })
    const dragApiRef: { current: BoardViewTestApi | null } = { current: null }

    renderBoard([item], { dragApiRef })

    act(() => dragApiRef.current!.handleDragEnd(dropResult('todo-1', 'todo', 0, 'in_progress', 0)))

    expect(screen.getByText('Dispatching DEF-1.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(8000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/id/item-1/dispatch', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tasks/reorder', expect.any(Object))
  })

  it('keeps optimistic dispatch placement when parent data refreshes during undo window', () => {
    const item = makeItem({ id: 'todo-1', itemId: 'item-1', title: 'Dispatch this task', shortId: 'DEF-1', taskStatus: 'todo' })
    const dragApiRef: { current: BoardViewTestApi | null } = { current: null }
    const board = renderBoard([item], { dragApiRef })

    act(() => dragApiRef.current!.handleDragEnd(dropResult('todo-1', 'todo', 0, 'in_progress', 0)))

    board.rerender(boardElement([item], { dragApiRef }))

    expect(within(screen.getByRole('region', { name: 'In progress' })).getByText('Dispatch this task')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'To do' })).queryByText('Dispatch this task')).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts refreshed parent data after the pending dispatch commits', async () => {
    const item = makeItem({ id: 'todo-1', itemId: 'item-1', title: 'Dispatch this task', shortId: 'DEF-1', taskStatus: 'todo' })
    const updated = { ...item, taskStatus: 'in_progress' as const, state: 'dispatching' as const }
    const dragApiRef: { current: BoardViewTestApi | null } = { current: null }
    const board = renderBoard([item], { dragApiRef })

    act(() => dragApiRef.current!.handleDragEnd(dropResult('todo-1', 'todo', 0, 'in_progress', 0)))
    await act(async () => {
      vi.advanceTimersByTime(8000)
      await Promise.resolve()
      await Promise.resolve()
    })

    board.rerender(boardElement([updated], { dragApiRef }))

    expect(within(screen.getByRole('region', { name: 'In progress' })).getByText('Dispatch this task')).toBeInTheDocument()
  })

  it('opens a required feedback composer for in review to in progress', () => {
    const item = makeItem({
      id: 'review-1',
      itemId: 'item-review',
      title: 'Needs follow-up',
      shortId: 'DEF-2',
      taskStatus: 'in_review',
      state: 'awaitingReview',
    })
    const dragApiRef: { current: BoardViewTestApi | null } = { current: null }

    renderBoard([item], { dragApiRef })

    act(() => dragApiRef.current!.handleDragEnd(dropResult('review-1', 'in_review', 0, 'in_progress', 0)))

    expect(screen.getByRole('form', { name: /Request changes for DEF-2/ })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('confirms in progress to todo cancellation before calling the API', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReset()
    const item = makeItem({
      id: 'running-1',
      itemId: 'item-running',
      title: 'Cancel this run',
      shortId: 'DEF-10',
      taskStatus: 'in_progress',
      state: 'running',
      currentRunId: 'run-1',
    })
    const cancelled = { ...item, taskStatus: 'todo' as const, state: 'discovered' as const, currentRunId: null }
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(detailResponse(cancelled)), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
    const dragApiRef: { current: BoardViewTestApi | null } = { current: null }
    const showNotice = vi.fn()

    renderBoard([item], { dragApiRef, showNotice })

    act(() => dragApiRef.current!.handleDragEnd(dropResult('running-1', 'in_progress', 0, 'todo', 0)))

    expect(screen.getByRole('dialog', { name: /Cancel run for DEF-10/ })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/items/id/item-running/cancel-run', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tasks/reorder', expect.any(Object))
    expect(showNotice).toHaveBeenCalledWith('Cancelled run for DEF-10.')
  })

  it('rejects dragging failed in progress tasks back to todo', () => {
    const showNotice = vi.fn()
    const item = makeItem({
      id: 'failed-1',
      itemId: 'item-failed',
      title: 'Failed run',
      shortId: 'DEF-11',
      taskStatus: 'in_progress',
      state: 'failed',
    })
    const dragApiRef: { current: BoardViewTestApi | null } = { current: null }

    renderBoard([item], { dragApiRef, showNotice })

    act(() => dragApiRef.current!.handleDragEnd(dropResult('failed-1', 'in_progress', 0, 'todo', 0)))

    expect(showNotice).toHaveBeenCalledWith('Only dispatching or running tasks can be cancelled by dragging.', 'error')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not render cancelled tasks on the active board', () => {
    const item = makeItem({
      id: 'cancelled-1',
      itemId: 'item-cancelled',
      title: 'Reopen me',
      shortId: 'DEF-3',
      taskStatus: 'cancelled',
      state: 'archived',
    })

    renderBoard([item])

    expect(screen.queryByRole('region', { name: 'Cancelled' })).not.toBeInTheDocument()
    expect(screen.queryByText('Reopen me')).not.toBeInTheDocument()
  })

  it('loads more archived items when scrolling near the end', () => {
    const loadMoreClosedItems = vi.fn()
    const archived = makeItem({
      id: 'archived-1',
      title: 'Archived task',
      shortId: 'DEF-6',
      taskStatus: 'cancelled',
      state: 'archived',
    })

    renderBoard([], {
      viewMode: 'archived',
      closedItems: [archived],
      closedNextCursor: '50',
      loadMoreClosedItems,
    })

    expect(screen.getByRole('region', { name: 'Archived tasks' })).toBeInTheDocument()
    expect(screen.getByText('Archived task')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()

    const closedList = document.querySelector('.closed-task-list') as HTMLElement
    Object.defineProperty(closedList, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(closedList, 'clientHeight', { configurable: true, value: 500 })

    fireEvent.scroll(closedList, { target: { scrollTop: 420 } })
    expect(loadMoreClosedItems).toHaveBeenCalledOnce()
    fireEvent.scroll(closedList, { target: { scrollTop: 500 } })
    expect(loadMoreClosedItems).toHaveBeenCalledOnce()
  })

  it('rejects dragging done tasks back to active columns', () => {
    const showNotice = vi.fn()
    const item = makeItem({ id: 'done-1', itemId: 'item-done', title: 'Already done', shortId: 'DEF-4', taskStatus: 'done', state: 'approved' })
    const dragApiRef: { current: BoardViewTestApi | null } = { current: null }

    renderBoard([item], { dragApiRef, showNotice })

    act(() => dragApiRef.current!.handleDragEnd(dropResult('done-1', 'done', 0, 'todo', 0)))

    expect(showNotice).toHaveBeenCalledWith('Done tasks cannot be reopened by dragging.', 'error')
  })

  it('persists same-column reordering immediately', async () => {
    const fetchMock = vi.mocked(fetch)
    const first = makeItem({ id: 'todo-1', itemId: 'item-1', title: 'First', shortId: 'DEF-1', taskStatus: 'todo', boardSortOrder: 0 })
    const second = makeItem({ id: 'todo-2', itemId: 'item-2', title: 'Second', shortId: 'DEF-2', taskStatus: 'todo', boardSortOrder: 1 })
    const dragApiRef: { current: BoardViewTestApi | null } = { current: null }

    renderBoard([first, second], { dragApiRef })

    act(() => dragApiRef.current!.handleDragEnd(dropResult('todo-2', 'todo', 1, 'todo', 0)))

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/tasks/reorder', expect.any(Object))
  })
})

function renderBoard(
  items: WorkItem[],
  overrides: Partial<ComponentProps<typeof BoardView>> & { dragApiRef?: { current: BoardViewTestApi | null } } = {},
) {
  return render(boardElement(items, overrides))
}

function boardElement(
  items: WorkItem[],
  overrides: Partial<ComponentProps<typeof BoardView>> & { dragApiRef?: { current: BoardViewTestApi | null } } = {},
) {
  return (
    <BoardView
      viewMode="active"
      setViewMode={vi.fn()}
      query=""
      setQuery={vi.fn()}
      repositoryFilter="all"
      repositories={['example-owner/oratorio']}
      setRepositoryFilter={vi.fn()}
      openCreateLocalTask={vi.fn()}
      refreshAll={vi.fn(async () => undefined)}
      syncGitHubSource={vi.fn(async () => undefined)}
      githubStatus={githubStatus}
      githubSyncJob={null}
      isSyncing={false}
      items={items}
      closedItems={[]}
      closedNextCursor={null}
      closedLoading={false}
      closedError={null}
      loadMoreClosedItems={vi.fn()}
      refreshClosedItems={vi.fn()}
      selectedItem={null}
      openItemFromQueue={vi.fn()}
      runnerMode="mock"
      mockOutcome="success"
      showNotice={vi.fn()}
      appIconSrc="/oratorio-icon.svg"
      openSettings={vi.fn()}
      {...overrides}
    />
  )
}

const githubStatus: GitHubSourceStatus = {
  available: true,
  configured: true,
  repositories: ['example-owner/oratorio'],
  lastSyncAt: null,
  message: 'GitHub source read integration is available.',
  writesEnabled: false,
  writeConfigured: false,
}

const activeGitHubSyncJob: GitHubSyncJob = {
  jobId: 'sync-1',
  trigger: 'manual',
  mode: 'incremental',
  status: 'running',
  repositoriesTotal: 1,
  repositoriesCompleted: 0,
  repositoriesFailed: 0,
  issuesImported: 0,
  pullRequestsImported: 0,
  commentsImported: 0,
  skipped: 0,
  createdAt: '2026-05-16T00:00:00Z',
  updatedAt: '2026-05-16T00:00:00Z',
  startedAt: '2026-05-16T00:00:00Z',
  completedAt: null,
  repositories: [],
}

function dropResult(draggableId: string, sourceId: TaskStatus, sourceIndex: number, destinationId: TaskStatus, destinationIndex: number): DropResult {
  return {
    draggableId,
    type: 'DEFAULT',
    source: { droppableId: sourceId, index: sourceIndex },
    destination: { droppableId: destinationId, index: destinationIndex },
    reason: 'DROP',
    mode: 'FLUID',
    combine: null,
  }
}

function detailResponse(item: WorkItem) {
  return {
    item: {
      itemId: item.itemId ?? item.id,
      workspaceId: 'default',
      source: item.sourceKey,
      externalId: item.externalId,
      kind: item.kind,
      title: item.title,
      description: item.description,
      repository: item.repository,
      assignee: item.assignee,
      branch: item.branch,
      externalUrl: item.externalUrl,
      labels: item.labels,
      sourceUpdatedAt: null,
      isDraft: item.isDraft,
      headSha: item.headSha,
      sourceState: item.sourceState,
      sourceClosedAt: item.sourceClosedAt,
      sourceMergedAt: item.sourceMergedAt,
      archiveReason: item.archiveReason,
      state: item.state,
      currentRound: item.round,
      currentRunId: item.currentRunId,
      latestSummary: item.summary,
      checkState: item.check,
      createdAt: '2026-05-09T00:00:00Z',
      updatedAt: '2026-05-09T00:00:00Z',
      lastSourceSyncAt: null,
      parentItemId: item.parentItemId,
      generatedFromDraftId: item.generatedFromDraftId,
      shortId: item.shortId,
      taskStatus: item.taskStatus,
      boardSortOrder: item.boardSortOrder,
    },
    rounds: [],
    runs: [],
    comments: [],
    decisions: [],
    timeline: [],
    sourceWrites: [],
    reviewDrafts: [],
    implementationDrafts: [],
    followUpDrafts: [],
    sourceSnapshot: null,
  }
}
