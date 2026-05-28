import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardView } from '../BoardView'
import type { GitHubSourceStatus, TaskStatus, WorkItem } from '../../lib/types'

function makeItem(overrides: Partial<WorkItem> & { id: string; title: string; shortId: string; taskStatus: TaskStatus }): WorkItem {
  return {
    id: overrides.id,
    itemId: overrides.itemId ?? overrides.id,
    sourceKey: overrides.sourceKey ?? 'local',
    externalId: overrides.externalId ?? overrides.id,
    currentRunId: null,
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

describe('BoardView task card DOM', () => {
  afterEach(cleanup)

  it('renders cards as draggable card buttons without queue row classes', () => {
    const todo = makeItem({ id: 'todo-1', title: 'Todo task', shortId: 'DEF-1', taskStatus: 'todo' })
    const done = makeItem({ id: 'done-1', title: 'Done task', shortId: 'DEF-2', taskStatus: 'done', state: 'approved' })

    render(
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
        items={[todo, done]}
        closedItems={[]}
        closedNextCursor={null}
        closedLoading={false}
        closedError={null}
        loadMoreClosedItems={vi.fn()}
        refreshClosedItems={vi.fn()}
        selectedItem={todo}
        openItemFromQueue={vi.fn()}
        runnerMode="mock"
        mockOutcome="success"
        showNotice={vi.fn()}
        appIconSrc="/oratorio-icon.svg"
        openSettings={vi.fn()}
      />,
    )

    const todoCard = screen.getByRole('button', { name: /Todo task/ })
    expect(todoCard).toHaveAttribute('tabindex', '0')
    expect(todoCard).not.toHaveAttribute('aria-disabled')
    expect(todoCard.className).toContain('task-card')
    expect(todoCard.className).toContain('task-card--selected')
    expect(todoCard).toHaveAttribute('data-task-card', 'DEF-1')
    expect(todoCard.className).not.toContain('item-row')
    expect(todoCard.className).not.toContain('board-item-row')
    expect(todoCard.querySelector('.task-card-topline')?.textContent).not.toContain('DEF-1')
    expect(todoCard.querySelector('.card-chip--id')).not.toBeInTheDocument()

    const doneCard = screen.getByRole('button', { name: /Done task/ })
    expect(doneCard).toHaveAttribute('tabindex', '0')
    expect(doneCard).toHaveAttribute('aria-disabled', 'true')
    expect(doneCard.className).toContain('task-card--locked')
    expect(doneCard.className).not.toContain('item-row')
    expect(doneCard.className).not.toContain('board-item-row')
  })

  it('hides redundant pending check status on running cards', () => {
    const running = makeItem({
      id: 'running-1',
      title: 'Run check noise',
      shortId: 'DEF-3',
      taskStatus: 'in_progress',
      state: 'running',
      check: 'pending',
      labels: [],
    })

    renderBoard([running])

    const card = screen.getByRole('button', { name: /Run check noise/ })
    expect(within(card).getAllByText('Running')).toHaveLength(1)
    expect(card.querySelector('.mini-check')).not.toBeInTheDocument()
  })

  it('hides not configured check status on discovered cards', () => {
    const discovered = makeItem({
      id: 'todo-1',
      title: 'Freshly discovered task',
      shortId: 'DEF-4',
      taskStatus: 'todo',
      state: 'discovered',
      check: 'notConfigured',
      labels: [],
    })

    renderBoard([discovered])

    const card = screen.getByRole('button', { name: /Freshly discovered task/ })
    expect(within(card).queryByText('Not configured')).not.toBeInTheDocument()
    expect(card.querySelector('.mini-check')).not.toBeInTheDocument()
  })

  it('keeps actionable check statuses visible on cards', () => {
    const attention = makeItem({
      id: 'attention-1',
      title: 'Needs operator attention',
      shortId: 'DEF-5',
      taskStatus: 'todo',
      check: 'attention',
      labels: [],
    })
    const failing = makeItem({
      id: 'failing-1',
      title: 'Failed review gate',
      shortId: 'DEF-6',
      taskStatus: 'todo',
      check: 'failing',
      labels: [],
    })
    const passing = makeItem({
      id: 'passing-1',
      title: 'Passing review gate',
      shortId: 'DEF-7',
      taskStatus: 'done',
      state: 'approved',
      check: 'passing',
      labels: [],
    })

    renderBoard([attention, failing, passing])

    const attentionCard = screen.getByRole('button', { name: /Needs operator attention/ })
    const failingCard = screen.getByRole('button', { name: /Failed review gate/ })
    const passingCard = screen.getByRole('button', { name: /Passing review gate/ })
    expect(attentionCard.querySelector('.mini-check.attention')).toBeInTheDocument()
    expect(within(attentionCard).getByText('Attention')).toBeInTheDocument()
    expect(failingCard.querySelector('.mini-check.failing')).toBeInTheDocument()
    expect(within(failingCard).getByText('Attention')).toBeInTheDocument()
    expect(passingCard.querySelector('.mini-check.passing')).toBeInTheDocument()
    expect(within(passingCard).getByText('Passing')).toBeInTheDocument()
  })
})

function renderBoard(items: WorkItem[], selectedItem: WorkItem | null = items[0] ?? null) {
  return render(
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
      selectedItem={selectedItem}
      openItemFromQueue={vi.fn()}
      runnerMode="mock"
      mockOutcome="success"
      showNotice={vi.fn()}
      appIconSrc="/oratorio-icon.svg"
      openSettings={vi.fn()}
    />,
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
