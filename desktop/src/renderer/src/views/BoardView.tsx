import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import type { DropResult, DraggableProvided } from '@hello-pangea/dnd'
import { CircleDot, Download, FileText, Folder, GitPullRequest, Plus, RefreshCw, Search, Settings } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { Tooltip } from '../components/primitives/Tooltip'
import { FilterDropdown, RepositoryFilterDropdown } from '../components/filters/RepositoryFilterDropdown'
import { UndoToastHost } from '../components/board/UndoToastHost'
import { RequestChangesModal } from '../components/board/RequestChangesModal'
import { useBoardCommander } from '../hooks/useBoardCommander'
import { sortItemsForBoard } from '../lib/sortOrder'
import { parseTaskSearchQuery, taskMatchesSearch } from '../lib/taskSearch'
import type { GitHubSourceStatus, GitHubSyncJob, MockOutcome, RunnerMode, UiNotice, WorkItem } from '../lib/types'
import {
  activeTaskStatusColumns,
  cardCheckBadge,
  cardStateBadge,
  queueLabelBadges,
  sourceLifecycleBadge,
  sourceMetaLabel,
  stateClassName,
  taskStatusBadgeClass,
} from '../lib/format'

export type BoardViewMode = 'active' | 'all' | 'cancelled' | 'archived'

const boardSearchHelpText = 'Advanced search supports s:github, source:github, l:frontend, and label:"good first issue".'

type BoardViewProps = {
  viewMode: BoardViewMode
  setViewMode: (mode: BoardViewMode) => void
  query: string
  setQuery: (value: string) => void
  repositoryFilter: string
  repositories: string[]
  setRepositoryFilter: (value: string) => void
  openCreateLocalTask: () => void
  refreshAll: () => Promise<void>
  syncGitHubSource: () => Promise<void>
  githubStatus: GitHubSourceStatus
  githubSyncJob: GitHubSyncJob | null
  hasConfiguredGitLab?: boolean
  isSyncing: boolean
  items: WorkItem[]
  closedItems: WorkItem[]
  closedNextCursor: string | null
  closedLoading: boolean
  closedError: string | null
  loadMoreClosedItems: () => void
  refreshClosedItems: () => void
  selectedItem: WorkItem | null | undefined
  openItemFromQueue: (item: WorkItem) => void
  runnerMode: RunnerMode
  mockOutcome: MockOutcome
  showNotice: (message: string, tone?: UiNotice['tone']) => void
  appIconSrc: string
  openSettings: () => void
  dragApiRef?: { current: BoardViewTestApi | null }
}

export type BoardViewTestApi = {
  handleDragEnd: (result: DropResult) => void
}

export function BoardView({
  viewMode,
  setViewMode,
  query,
  setQuery,
  repositoryFilter,
  repositories,
  setRepositoryFilter,
  openCreateLocalTask,
  refreshAll,
  syncGitHubSource,
  githubStatus,
  githubSyncJob,
  hasConfiguredGitLab = false,
  isSyncing,
  items,
  closedItems,
  closedNextCursor,
  closedLoading,
  closedError,
  loadMoreClosedItems,
  refreshClosedItems,
  selectedItem,
  openItemFromQueue,
  runnerMode,
  mockOutcome,
  showNotice,
  appIconSrc,
  openSettings,
  dragApiRef,
}: BoardViewProps) {
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const closedListRef = useRef<HTMLDivElement | null>(null)
  const requestedClosedCursorRef = useRef<string | null>(null)
  const commander = useBoardCommander({
    items,
    runnerMode,
    mockOutcome,
    refreshAll,
    notify: showNotice,
  })

  useEffect(() => {
    if (!dragApiRef) {
      return
    }

    dragApiRef.current = { handleDragEnd: commander.handleDragEnd }
    return () => {
      dragApiRef.current = null
    }
  }, [commander.handleDragEnd, dragApiRef])

  const isActiveView = viewMode === 'active'
  const viewItems = isActiveView ? commander.boardItems : closedItems
  const assigneeOptions = useMemo(() => Array.from(new Set(viewItems.map((item) => item.assignee).filter(Boolean))).sort(), [viewItems])
  const parsedSearchQuery = useMemo(() => parseTaskSearchQuery(query), [query])

  const filteredItems = useMemo(
    () =>
      viewItems.filter((item) => {
        const matchesRepository = repositoryFilter === 'all' || item.repository === repositoryFilter
        const matchesAssignee = assigneeFilter === 'all' || item.assignee === assigneeFilter

        return matchesRepository && matchesAssignee && taskMatchesSearch(item, parsedSearchQuery)
      }),
    [assigneeFilter, parsedSearchQuery, repositoryFilter, viewItems],
  )

  const itemsByStatus = useMemo(
    () =>
      new Map(activeTaskStatusColumns.map((column) => [
        column.id,
        sortItemsForBoard(filteredItems.filter((item) => item.taskStatus === column.id)),
      ])),
    [filteredItems],
  )
  const viewLabel = viewModeLabels[viewMode]
  const githubSyncActive = isActiveGitHubSyncJob(githubSyncJob)
  const canPullGitHub = hasConfiguredGitLab ? !isSyncing && !githubSyncActive : githubStatus.available && githubStatus.configured && !isSyncing && !githubSyncActive
  const pullGitHubLabel = hasConfiguredGitLab
    ? isSyncing ? 'Starting source sync' : githubSyncActive ? 'Syncing sources' : 'Sync sources'
    : isSyncing ? 'Starting GitHub pull' : githubSyncActive ? 'Pulling GitHub' : 'Pull GitHub'
  const pullGitHubTitle = hasConfiguredGitLab
    ? 'Sync configured GitHub and GitLab sources'
    : githubStatus.configured ? pullGitHubLabel : githubStatus.message

  useEffect(() => {
    if (!closedLoading) {
      requestedClosedCursorRef.current = null
    }
  }, [closedLoading, closedNextCursor])

  const maybeLoadMoreClosedItems = useCallback(() => {
    if (isActiveView || !closedNextCursor || closedLoading || requestedClosedCursorRef.current === closedNextCursor) {
      return
    }

    const list = closedListRef.current
    if (!list) {
      return
    }

    if (list.clientHeight <= 0 && list.scrollHeight <= 0) {
      return
    }

    const remainingScroll = list.scrollHeight - list.scrollTop - list.clientHeight
    if (remainingScroll <= 96) {
      requestedClosedCursorRef.current = closedNextCursor
      loadMoreClosedItems()
    }
  }, [closedLoading, closedNextCursor, isActiveView, loadMoreClosedItems])

  const handleClosedListScroll = useCallback(() => {
    maybeLoadMoreClosedItems()
  }, [maybeLoadMoreClosedItems])

  useEffect(() => {
    maybeLoadMoreClosedItems()
  }, [filteredItems.length, maybeLoadMoreClosedItems])

  return (
    <section className="board-view" aria-label="Task board">
      <header className="board-header">
        <div className="board-title-lockup">
          <span className="brand-mark board-brand-mark">
            <img src={appIconSrc} alt="" aria-hidden="true" />
            <svg className="board-wand-overlay" viewBox="225 190 640 640" aria-hidden="true" focusable="false">
              <g transform="translate(128 128) scale(.75)">
                <path className="board-wand-aura" d="M808 606 896 294" />
                <ellipse className="board-wand-orbit-halo" cx="852" cy="450" rx="106" ry="35" transform="rotate(-74 852 450)" />
                <circle className="board-wand-expanding-halo" cx="896" cy="294" r="48" />
                <circle className="board-wand-expanding-halo secondary" cx="896" cy="294" r="40" />
                <path className="board-wand-body-halo" d="M808 606 896 294" />
                <path className="board-wand-core" d="M808 606 896 294" />
                <circle className="board-wand-tip-glow" cx="896" cy="294" r="42" />
                <g className="board-wand-spark">
                  <path d="M896 214v48" />
                  <path d="M872 238h48" />
                </g>
                <g className="board-wand-spark secondary">
                  <path d="M942 260v34" />
                  <path d="M925 277h34" />
                </g>
              </g>
            </svg>
          </span>
          <div>
            <h1>Oratorio</h1>
          </div>
        </div>
      </header>

      <div className="board-toolbar" aria-label="Board filters">
        <div className="segmented-control board-view-switcher" aria-label="Board view">
          {boardViewModes.map((mode) => (
            <button key={mode} type="button" className={viewMode === mode ? 'selected' : ''} onClick={() => setViewMode(mode)}>
              {viewModeLabels[mode]}
            </button>
          ))}
        </div>
        <Tooltip content={boardSearchHelpText}>
          <div className="search-box board-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks"
              aria-label="Search tasks"
              aria-describedby="board-search-help"
            />
            <span id="board-search-help" className="board-search-help">
              {boardSearchHelpText}
            </span>
          </div>
        </Tooltip>
        <RepositoryFilterDropdown value={repositoryFilter} repositories={repositories} onChange={setRepositoryFilter} />
        <FilterDropdown label="Assignee" value={assigneeFilter} onChange={setAssigneeFilter} options={filterOptions('All assignees', assigneeOptions)} />
        <div className="board-toolbar-actions">
          <ActionIcon label="New local task" onClick={openCreateLocalTask}>
            <Plus size={16} />
          </ActionIcon>
          <ActionIcon label={pullGitHubLabel} title={pullGitHubTitle} onClick={() => void syncGitHubSource()} disabled={!canPullGitHub}>
            {isSyncing || githubSyncActive ? <RefreshCw size={16} className="spin-icon" /> : <Download size={16} />}
          </ActionIcon>
          <ActionIcon label="Refresh" onClick={() => void (isActiveView ? refreshAll() : refreshClosedItems())}>
            <RefreshCw size={16} />
          </ActionIcon>
          <ActionIcon label="Settings" onClick={openSettings}>
            <Settings size={16} />
          </ActionIcon>
        </div>
      </div>

      {isActiveView ? (
        <DragDropContext onDragEnd={commander.handleDragEnd}>
          <div className="board-columns" aria-label="Task status columns">
            {activeTaskStatusColumns.map((column) => {
              const columnItems = itemsByStatus.get(column.id) ?? []
              return (
                <section className="board-column" aria-label={column.label} key={column.id}>
                  <header className="board-column-header">
                    <span>
                      <strong>{column.label}</strong>
                      <small>{column.description}</small>
                    </span>
                    <span className={`task-status-count ${taskStatusBadgeClass(column.id)}`}>{columnItems.length}</span>
                  </header>
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`board-column-list${snapshot.isDraggingOver ? ' is-drag-over' : ''}`}
                      >
                        {columnItems.length === 0 ? <p className="board-empty">No tasks here.</p> : null}
                        {columnItems.map((item, index) => (
                          <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={item.taskStatus === 'done'}>
                            {(dragProvided, dragSnapshot) => (
                              <TaskCard
                                item={item}
                                selected={selectedItem?.id === item.id}
                                onOpen={() => openItemFromQueue(item)}
                                provided={dragProvided}
                                dragging={dragSnapshot.isDragging}
                                dragDisabled={item.taskStatus === 'done'}
                              />
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </section>
              )
            })}
          </div>
        </DragDropContext>
      ) : (
        <section className="closed-task-panel" aria-label={`${viewLabel} tasks`}>
          <header className="closed-task-header">
            <span>
              <strong>{viewLabel}</strong>
              <small>{closedViewDescriptions[viewMode]}</small>
            </span>
            <span className="task-status-count">{filteredItems.length}</span>
          </header>
          <div className="closed-task-list" ref={closedListRef} onScroll={handleClosedListScroll} aria-busy={closedLoading}>
            {closedError ? <p className="board-empty error-text">{closedError}</p> : null}
            {closedLoading && closedItems.length === 0 ? <p className="board-empty">Loading tasks...</p> : null}
            {!closedLoading && filteredItems.length === 0 ? <p className="board-empty">No tasks here.</p> : null}
            {filteredItems.map((item) => (
              <TaskCard
                key={item.id}
                item={item}
                selected={selectedItem?.id === item.id}
                onOpen={() => openItemFromQueue(item)}
                staticCard
              />
            ))}
          </div>
          {closedLoading && closedItems.length > 0 ? (
            <div className="closed-task-footer" aria-live="polite">
              <span className="closed-task-footer-status">Loading more tasks...</span>
            </div>
          ) : null}
        </section>
      )}
      <div className="board-live-region" aria-live="polite" aria-atomic="true">
        {commander.liveMessage}
      </div>
      <UndoToastHost toasts={commander.undoToasts} />
      {commander.pendingComposer ? (
        <RequestChangesModal
          item={commander.pendingComposer.item}
          busy={commander.composerBusy}
          error={commander.composerError}
          onCancel={commander.cancelRequestChanges}
          onSubmit={(value) => void commander.submitRequestChanges(value)}
        />
      ) : null}
    </section>
  )
}

function filterOptions(allLabel: string, values: string[]) {
  return [{ value: 'all', label: allLabel }, ...values.map((value) => ({ value, label: value }))]
}

function isActiveGitHubSyncJob(job: GitHubSyncJob | null) {
  return job?.status === 'queued' || job?.status === 'running'
}

const boardViewModes: BoardViewMode[] = ['active', 'all', 'cancelled', 'archived']

const viewModeLabels: Record<BoardViewMode, string> = {
  active: 'Active',
  all: 'All',
  cancelled: 'Cancelled',
  archived: 'Archived',
}

const closedViewDescriptions: Record<BoardViewMode, string> = {
  active: '',
  all: 'All tasks, newest updates first.',
  cancelled: 'Rejected tasks.',
  archived: 'Archived tasks.',
}

const chipIconProps = { size: 14, strokeWidth: 1.75 } as const

function GithubGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

function GitlabGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="m23.6 9.6-.03-.09L20.42.7a.83.83 0 0 0-1.55.05L16.74 7.2H7.27L5.13.75a.82.82 0 0 0-.78-.56.83.83 0 0 0-.78.56L.43 9.5l-.03.1a5.85 5.85 0 0 0 2.13 6.78l.01.01.03.02 5.27 3.94 2.61 1.97 1.58 1.2a.97.97 0 0 0 1.18 0l1.58-1.2 2.6-1.97 5.32-3.96.02-.02a5.86 5.86 0 0 0 2.12-6.77Z" />
    </svg>
  )
}

function sourceChipIcon(item: WorkItem) {
  if (item.sourceKey === 'github') return <GithubGlyph />
  if (item.sourceKey === 'gitlab') return <GitlabGlyph />
  return <Folder {...chipIconProps} />
}

function sourceChipLabel(item: WorkItem) {
  if (item.sourceKey === 'github' || item.sourceKey === 'gitlab') {
    return item.repository || item.sourceKey
  }
  return 'Local'
}

function sourceChipTooltip(item: WorkItem) {
  if (item.sourceKey === 'github' || item.sourceKey === 'gitlab') {
    return `${item.sourceKey === 'github' ? 'GitHub' : 'GitLab'} · ${item.repository || ''}`
  }
  return 'Local task'
}

function kindChipIcon(item: WorkItem) {
  if (item.type === 'pr') return <GitPullRequest {...chipIconProps} />
  if (item.type === 'issue') return <CircleDot {...chipIconProps} />
  return <FileText {...chipIconProps} />
}

function kindChipLabel(item: WorkItem) {
  const number = item.number ?? ''
  const looksLikeNumber = /^#?\d+$/.test(number)
  if (item.type === 'pr') return looksLikeNumber ? (number.startsWith('#') ? number : `#${number}`) : 'PR'
  if (item.type === 'issue') return looksLikeNumber ? (number.startsWith('#') ? number : `#${number}`) : 'Issue'
  return 'Task'
}

function kindChipTooltip(item: WorkItem) {
  if (item.type === 'pr') return 'Pull request'
  if (item.type === 'issue') return 'Issue'
  return 'Local task'
}

function cardAccentTone(item: WorkItem): 'awaiting' | 'failed' | 'running' | null {
  if (item.state === 'awaitingReview') return 'awaiting'
  if (item.state === 'failed' || item.check === 'failing') return 'failed'
  if (item.state === 'running' || item.state === 'dispatching') return 'running'
  return null
}

function TaskCard({
  item,
  selected,
  onOpen,
  provided,
  dragging,
  dragDisabled,
  staticCard,
}: {
  item: WorkItem
  selected: boolean
  onOpen: () => void
  provided?: DraggableProvided
  dragging?: boolean
  dragDisabled?: boolean
  staticCard?: boolean
}) {
  const descriptionPreview = item.description.trim() || item.summary
  const accentTone = cardAccentTone(item)
  const cardClassName = [
    'task-card',
    selected ? 'task-card--selected' : '',
    dragging ? 'task-card--dragging' : '',
    dragDisabled ? 'task-card--locked' : '',
    staticCard ? 'task-card--static' : '',
    accentTone ? `task-card--accent-${accentTone}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && !((dragDisabled || staticCard) && event.key === ' ')) {
      return
    }

    event.preventDefault()
    onOpen()
  }

  return (
    <div
      ref={provided?.innerRef}
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      role="button"
      tabIndex={0}
      aria-disabled={dragDisabled ? true : undefined}
      data-task-card={item.shortId ?? item.itemId ?? item.id}
      className={cardClassName}
      onClick={onOpen}
      onKeyDownCapture={handleKeyDown}
    >
      <div className="task-card-topline">
        <Tooltip content={sourceChipTooltip(item)}>
          <span className={`card-chip card-chip--source card-chip--source-${item.sourceKey}`}>
            {sourceChipIcon(item)}
            <span>{sourceChipLabel(item)}</span>
          </span>
        </Tooltip>
        <Tooltip content={kindChipTooltip(item)}>
          <span className={`card-chip card-chip--kind card-chip--kind-${item.type}`}>
            {kindChipIcon(item)}
            <span>{kindChipLabel(item)}</span>
          </span>
        </Tooltip>
      </div>
      <div className="task-card-main">
        <div className="task-card-title-line">
          <span className="item-title">{item.title}</span>
          <span className={`state-dot ${stateClassName(item.state)}`} />
        </div>
        <span className="task-card-preview">{descriptionPreview}</span>
        <span className="item-source-meta">{sourceMetaLabel(item)} · updated {item.updated}</span>
        <div className="task-card-footer">
          {sourceLifecycleBadge(item)}
          {cardStateBadge(item)}
          {cardCheckBadge(item)}
          {queueLabelBadges(item)}
        </div>
      </div>
    </div>
  )
}
