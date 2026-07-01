import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import type { DropResult, DraggableProvided, DragStart, DragUpdate } from '@hello-pangea/dnd'
import { CircleDot, FileText, Folder, GitPullRequest, Plus, RefreshCw, Search, Settings } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { GithubGlyph, GitlabGlyph } from '../components/primitives/ProviderGlyphs'
import { Tooltip } from '../components/primitives/Tooltip'
import { FilterDropdown, RepositoryFilterDropdown } from '../components/filters/RepositoryFilterDropdown'
import { UndoToastHost } from '../components/board/UndoToastHost'
import { RequestChangesModal } from '../components/board/RequestChangesModal'
import { CancelRunModal } from '../components/board/CancelRunModal'
import { useBoardCommander } from '../hooks/useBoardCommander'
import { resolveDrag } from '../lib/dragMatrix'
import { sortItemsForBoard } from '../lib/sortOrder'
import { parseTaskSearchQuery, taskMatchesSearch } from '../lib/taskSearch'
import { buildSourceProjectFilterOptions, sourceProjectDisplay, sourceProjectMatchesFilter, type SourceProjectFilterOption } from '../lib/sourceProjects'
import type { GitHubSourceStatus, GitHubSyncJob, MockOutcome, RunnerMode, TaskStatus, UiNotice, WorkItem } from '../lib/types'
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

type BoardViewProps = {
  viewMode: BoardViewMode
  setViewMode: (mode: BoardViewMode) => void
  query: string
  setQuery: (value: string) => void
  repositoryFilter: string
  repositories: string[]
  sourceProjectOptions?: SourceProjectFilterOption[]
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

type DropIndicatorState = {
  droppableId: string
  top: number
  left: number
  width: number
  height: number
}

const DROP_SLOT_GAP_FALLBACK = 12

// Compute where the dragged card would land inside a column, in the column's own
// scroll coordinates. The dragged card is taken out of flow (position: fixed) during a
// drag, so the remaining cards' layout offsets already collapse to the "card removed"
// positions — indexing them by the destination index lands exactly on the open slot.
function measureDropSlot(draggableId: string, droppableId: string, index: number): Omit<DropIndicatorState, 'droppableId'> | null {
  if (typeof document === 'undefined') {
    return null
  }

  const dragged = document.querySelector<HTMLElement>(`[data-rfd-draggable-id="${draggableId}"]`)
  const list = document.querySelector<HTMLElement>(`[data-rfd-droppable-id="${droppableId}"]`)
  if (!dragged || !list) {
    return null
  }

  const listStyle = window.getComputedStyle(list)
  const paddingTop = parseFloat(listStyle.paddingTop) || 0
  const paddingLeft = parseFloat(listStyle.paddingLeft) || 0
  const paddingRight = parseFloat(listStyle.paddingRight) || 0
  const height = dragged.offsetHeight
  const width = list.clientWidth - paddingLeft - paddingRight

  const cards = Array.from(list.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && el.getAttribute('data-rfd-draggable-id') !== null && el.getAttribute('data-rfd-draggable-id') !== draggableId,
  )

  if (cards.length === 0) {
    return { top: paddingTop, left: paddingLeft, width, height }
  }

  if (index >= cards.length) {
    const last = cards[cards.length - 1]
    const gap = parseFloat(window.getComputedStyle(last).marginBottom) || DROP_SLOT_GAP_FALLBACK
    return { top: last.offsetTop + last.offsetHeight + gap, left: paddingLeft, width, height }
  }

  const target = cards[Math.max(0, index)]
  return { top: target.offsetTop, left: paddingLeft, width, height }
}

export function BoardView({
  viewMode,
  setViewMode,
  query,
  setQuery,
  repositoryFilter,
  repositories,
  sourceProjectOptions: providedSourceProjectOptions,
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
  selectedItem,
  openItemFromQueue,
  runnerMode,
  mockOutcome,
  showNotice,
  appIconSrc,
  openSettings,
  dragApiRef,
}: BoardViewProps) {
  const { t } = useTranslation()
  const boardSearchHelpText = t('board:search.help')
  const viewModeLabel = (mode: BoardViewMode) => t(`board:viewMode.${mode}`)
  const closedViewDescription = (mode: BoardViewMode) => (mode === 'active' ? '' : t(`board:closedDescription.${mode}`))
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

  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null)
  const itemById = useMemo(() => new Map(commander.boardItems.map((item) => [item.id, item])), [commander.boardItems])

  // Mirror the open slot the dnd library is making room for. The library reserves space
  // with an invisible placeholder at the list tail, so we draw our own marker at the real
  // insertion point and hide it whenever the drop would be rejected.
  const refreshDropIndicator = useCallback(
    (draggableId: string, fromStatus: TaskStatus, destination: { droppableId: string; index: number } | null) => {
      if (!destination) {
        setDropIndicator(null)
        return
      }

      const item = itemById.get(draggableId)
      if (item && resolveDrag(fromStatus, destination.droppableId as TaskStatus, item).kind === 'invalid') {
        setDropIndicator(null)
        return
      }

      const rect = measureDropSlot(draggableId, destination.droppableId, destination.index)
      setDropIndicator(rect ? { droppableId: destination.droppableId, ...rect } : null)
    },
    [itemById],
  )

  const handleDragStart = useCallback(
    (start: DragStart) => {
      refreshDropIndicator(start.draggableId, start.source.droppableId as TaskStatus, {
        droppableId: start.source.droppableId,
        index: start.source.index,
      })
    },
    [refreshDropIndicator],
  )

  const handleDragUpdate = useCallback(
    (update: DragUpdate) => {
      refreshDropIndicator(update.draggableId, update.source.droppableId as TaskStatus, update.destination ?? null)
    },
    [refreshDropIndicator],
  )

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      setDropIndicator(null)
      commander.handleDragEnd(result)
    },
    [commander.handleDragEnd],
  )

  const isActiveView = viewMode === 'active'
  const viewItems = isActiveView ? commander.boardItems : closedItems
  const computedSourceProjectOptions = useMemo(
    () => buildSourceProjectFilterOptions(repositories),
    [repositories],
  )
  const sourceProjectOptions = providedSourceProjectOptions ?? computedSourceProjectOptions
  const assigneeOptions = useMemo(() => Array.from(new Set(viewItems.map((item) => item.assignee).filter(Boolean))).sort(), [viewItems])
  const parsedSearchQuery = useMemo(() => parseTaskSearchQuery(query), [query])

  const filteredItems = useMemo(
    () =>
      viewItems.filter((item) => {
        const matchesRepository = sourceProjectMatchesFilter(item.repository, repositoryFilter, item.sourceKey)
        const matchesAssignee = assigneeFilter === 'all' || item.assignee === assigneeFilter

        return matchesRepository && matchesAssignee && taskMatchesSearch(item, parsedSearchQuery)
      }),
    [assigneeFilter, parsedSearchQuery, repositoryFilter, viewItems],
  )

  const itemsByStatus = useMemo(
    () =>
      new Map(activeTaskStatusColumns().map((column) => [
        column.id,
        sortItemsForBoard(filteredItems.filter((item) => item.taskStatus === column.id)),
      ])),
    [filteredItems],
  )
  const viewLabel = viewModeLabel(viewMode)
  const githubSyncActive = isActiveGitHubSyncJob(githubSyncJob)
  const canPullGitHub = hasConfiguredGitLab ? !isSyncing && !githubSyncActive : githubStatus.available && githubStatus.configured && !isSyncing && !githubSyncActive
  const pullGitHubLabel = hasConfiguredGitLab
    ? isSyncing ? t('board:sync.startingSource') : githubSyncActive ? t('board:sync.syncingSources') : t('board:sync.syncSources')
    : isSyncing ? t('board:sync.startingGitHub') : githubSyncActive ? t('board:sync.pullingGitHub') : t('board:sync.pullGitHub')
  const pullGitHubTitle = hasConfiguredGitLab
    ? t('board:sync.syncTitle')
    : githubStatus.configured ? pullGitHubLabel : githubStatus.message

  const syncing = isSyncing || githubSyncActive
  const [justSynced, setJustSynced] = useState(false)
  const previousSyncingRef = useRef(syncing)

  // Pulse the pull control in place when a sync finishes, replacing the old
  // "sync finished" toast with a quiet on-card acknowledgement.
  useEffect(() => {
    if (previousSyncingRef.current && !syncing) {
      setJustSynced(true)
      const timer = window.setTimeout(() => setJustSynced(false), 900)
      previousSyncingRef.current = syncing
      return () => window.clearTimeout(timer)
    }
    previousSyncingRef.current = syncing
  }, [syncing])

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
    <section className="board-view" aria-label={t('board:aria.taskBoard')}>
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
            <h1>{t('board:appName')}</h1>
          </div>
        </div>
      </header>

      <div className="board-toolbar" aria-label={t('board:aria.boardFilters')}>
        <div className="segmented-control board-view-switcher" aria-label={t('board:aria.boardView')}>
          {boardViewModes.map((mode) => (
            <button key={mode} type="button" className={viewMode === mode ? 'selected' : ''} onClick={() => setViewMode(mode)}>
              {viewModeLabel(mode)}
            </button>
          ))}
        </div>
        <Tooltip content={boardSearchHelpText}>
          <div className="search-box board-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('board:search.placeholder')}
              aria-label={t('board:search.placeholder')}
              aria-describedby="board-search-help"
            />
            <span id="board-search-help" className="board-search-help">
              {boardSearchHelpText}
            </span>
          </div>
        </Tooltip>
        <RepositoryFilterDropdown value={repositoryFilter} repositories={repositories} onChange={setRepositoryFilter} />
        <FilterDropdown label={t('board:filters.assignee')} value={assigneeFilter} onChange={setAssigneeFilter} options={filterOptions(t('board:filters.allAssignees'), assigneeOptions)} />
        <div className="board-toolbar-actions">
          <ActionIcon label={t('board:actions.newLocalTask')} onClick={openCreateLocalTask} dataTour="new-task">
            <Plus size={16} />
          </ActionIcon>
          <ActionIcon
            label={pullGitHubLabel}
            title={pullGitHubTitle}
            className={`icon-button${justSynced ? ' icon-button--pulse' : ''}`}
            onClick={() => void syncGitHubSource()}
            disabled={!canPullGitHub}
          >
            <RefreshCw size={16} className={syncing ? 'spin-icon' : undefined} />
          </ActionIcon>
          <ActionIcon label={t('board:actions.settings')} onClick={openSettings} dataTour="settings-gear">
            <Settings size={16} />
          </ActionIcon>
        </div>
      </div>

      {isActiveView ? (
        <DragDropContext onDragStart={handleDragStart} onDragUpdate={handleDragUpdate} onDragEnd={handleDragEnd}>
          <div className="board-columns" aria-label={t('board:aria.statusColumns')} data-tour="board-columns">
            {activeTaskStatusColumns().map((column) => {
              const columnItems = itemsByStatus.get(column.id) ?? []
              return (
                <section className="board-column" aria-label={column.label} key={column.id} data-tour={`board-column-${column.id}`}>
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
                        {columnItems.length === 0 && dropIndicator?.droppableId !== column.id ? (
                          <p className="board-empty">{t('board:empty')}</p>
                        ) : null}
                        {columnItems.map((item, index) => (
                          <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={item.taskStatus === 'done'}>
                            {(dragProvided, dragSnapshot) => (
                              <TaskCard
                                item={item}
                                sourceProjectOptions={sourceProjectOptions}
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
                        {dropIndicator?.droppableId === column.id ? (
                          <div
                            className="board-drop-indicator"
                            aria-hidden="true"
                            style={{
                              top: dropIndicator.top,
                              left: dropIndicator.left,
                              width: dropIndicator.width,
                              height: dropIndicator.height,
                            }}
                          />
                        ) : null}
                      </div>
                    )}
                  </Droppable>
                </section>
              )
            })}
          </div>
        </DragDropContext>
      ) : (
        <section className="closed-task-panel" aria-label={t('board:aria.closedTasks', { label: viewLabel })}>
          <header className="closed-task-header">
            <span>
              <strong>{viewLabel}</strong>
              <small>{closedViewDescription(viewMode)}</small>
            </span>
            <span className="task-status-count">{filteredItems.length}</span>
          </header>
          <div className="closed-task-list" ref={closedListRef} onScroll={handleClosedListScroll} aria-busy={closedLoading}>
            {closedError ? <p className="board-empty error-text">{closedError}</p> : null}
            {closedLoading && closedItems.length === 0 ? <p className="board-empty">{t('board:loading')}</p> : null}
            {!closedLoading && filteredItems.length === 0 ? <p className="board-empty">{t('board:empty')}</p> : null}
            {filteredItems.map((item) => (
              <TaskCard
                key={item.id}
                item={item}
                sourceProjectOptions={sourceProjectOptions}
                selected={selectedItem?.id === item.id}
                onOpen={() => openItemFromQueue(item)}
                staticCard
              />
            ))}
          </div>
          {closedLoading && closedItems.length > 0 ? (
            <div className="closed-task-footer" aria-live="polite">
              <span className="closed-task-footer-status">{t('board:loadingMore')}</span>
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
      {commander.pendingCancelRun ? (
        <CancelRunModal
          item={commander.pendingCancelRun.item}
          busy={commander.cancelRunBusy}
          error={commander.cancelRunError}
          onCancel={commander.cancelCancelRun}
          onConfirm={(body) => void commander.confirmCancelRun(body)}
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

const chipIconProps = { size: 14, strokeWidth: 1.75 } as const

function sourceChipIcon(item: WorkItem) {
  if (item.sourceKey === 'github') return <GithubGlyph />
  if (item.sourceKey === 'gitlab') return <GitlabGlyph />
  return <Folder {...chipIconProps} />
}

function sourceChipLabel(item: WorkItem, sourceProjectOptions: SourceProjectFilterOption[]) {
  if (item.sourceKey === 'github' || item.sourceKey === 'gitlab') {
    return sourceProjectDisplay(item.repository, sourceProjectOptions, item.sourceKey).label || item.sourceKey
  }
  return i18n.t('board:chip.local')
}

function sourceChipTooltip(item: WorkItem, sourceProjectOptions: SourceProjectFilterOption[]) {
  if (item.sourceKey === 'github' || item.sourceKey === 'gitlab') {
    return sourceProjectDisplay(item.repository, sourceProjectOptions, item.sourceKey).tooltip
  }
  return i18n.t('board:chip.localTask')
}

function kindChipIcon(item: WorkItem) {
  if (item.type === 'pr') return <GitPullRequest {...chipIconProps} />
  if (item.type === 'issue') return <CircleDot {...chipIconProps} />
  return <FileText {...chipIconProps} />
}

function kindChipLabel(item: WorkItem) {
  const number = item.number ?? ''
  const looksLikeNumber = /^#?\d+$/.test(number)
  if (item.type === 'pr') return looksLikeNumber ? (number.startsWith('#') ? number : `#${number}`) : i18n.t('board:chip.pr')
  if (item.type === 'issue') return looksLikeNumber ? (number.startsWith('#') ? number : `#${number}`) : i18n.t('board:chip.issue')
  return i18n.t('board:chip.task')
}

function kindChipTooltip(item: WorkItem) {
  if (item.type === 'pr') return i18n.t('board:chip.pullRequest')
  if (item.type === 'issue') return i18n.t('board:chip.issue')
  return i18n.t('board:chip.localTask')
}

function cardAccentTone(item: WorkItem): 'awaiting' | 'failed' | 'running' | null {
  if (item.state === 'awaitingReview') return 'awaiting'
  if (item.state === 'failed' || item.check === 'failing') return 'failed'
  if (item.state === 'running' || item.state === 'dispatching') return 'running'
  return null
}

function TaskCard({
  item,
  sourceProjectOptions,
  selected,
  onOpen,
  provided,
  dragging,
  dragDisabled,
  staticCard,
}: {
  item: WorkItem
  sourceProjectOptions: SourceProjectFilterOption[]
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
        <Tooltip content={sourceChipTooltip(item, sourceProjectOptions)}>
          <span className={`card-chip card-chip--source card-chip--source-${item.sourceKey}`}>
            {sourceChipIcon(item)}
            <span>{sourceChipLabel(item, sourceProjectOptions)}</span>
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
        <span className="item-source-meta">{sourceMetaLabel(item)} · {i18n.t('board:card.updated', { value: item.updated })}</span>
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
