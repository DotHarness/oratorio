import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleDot,
  Clock3,
  Eye,
  GitCommit,
  GitPullRequest,
  ListFilter,
  LoaderCircle,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Tag,
  XCircle,
} from 'lucide-react'
import { Tooltip } from '../components/primitives/Tooltip'
import { normalizeMarkdownForDisplay } from '../markdownDisplay'
import i18n from '../i18n'
import type {
  BriefFields,
  CheckState,
  CommentDto,
  Decision,
  DecisionDto,
  DeliveryPolicy,
  DotCraftHealth,
  DotCraftStatus,
  DotCraftWorkspace,
  FollowUpDraftStatus,
  GitHubSourceStatus,
  ImplementationDraft,
  ImplementationDraftStatus,
  ItemDetailResponse,
  ItemKind,
  ItemState,
  ItemSummaryDto,
  ItemType,
  LocalTaskForm,
  ReviewDraft,
  ReviewDraftDto,
  ReviewDraftStatus,
  ReReviewInfo,
  ReviewStageId,
  Round,
  RoundDto,
  RoundHistory,
  Run,
  RunDto,
  RunnerMode,
  RunStatus,
  SourceComment,
  SourceSnapshotDto,
  SourceState,
  SourceWrite,
  SourceWriteDto,
  SourceWriteKind,
  SourceWriteStatus,
  TaskStatus,
  TimelineEvent,
  TimelineEventDto,
  TimelineKind,
  WorkItem,
  WorktreeStatus,
} from './types'

export function stateLabel(state: ItemState): string {
  return i18n.t(`domain:state.${state}`)
}

export const stateTabs: Array<'all' | ItemState> = ['all', 'awaitingReview', 'running', 'discovered', 'approved', 'archived']

export const taskStatusOrder: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done', 'cancelled']

export function taskStatusColumns(): Array<{ id: TaskStatus; label: string; description: string }> {
  return taskStatusOrder.map((id) => ({
    id,
    label: i18n.t(`domain:taskStatus.${id}.label`),
    description: i18n.t(`domain:taskStatus.${id}.description`),
  }))
}

export function activeTaskStatusColumns(): Array<{ id: TaskStatus; label: string; description: string }> {
  return taskStatusColumns().filter((column) => column.id !== 'cancelled')
}
export const defaultLocalTaskLabels = [
  'oratorio:auto',
  'local-task-smoke',
  'issue-smoke',
  'docs',
  'bug',
  'feature',
  'review',
  'backend',
  'frontend',
  'security',
  'test',
  'chore',
]
export const themeStorageKey = 'oratorio.ui.theme'
export const sidebarWidthStorageKey = 'oratorio.sidebar.width'
export const reviewSidecarWidthStorageKey = 'oratorio.reviewSidecar.width'
export const drawerWidthStorageKey = 'oratorio.taskDrawer.width'
export const localTaskSourceProjectStorageKey = 'oratorio.localTask.sourceProject'
export const defaultSidebarWidth = 280
export const minSidebarWidth = 240
export const maxSidebarWidth = 360
export const defaultReviewSidecarWidth = 380
export const minReviewSidecarWidth = 320
export const maxReviewSidecarWidth = 520
export const defaultDrawerWidth = 560
export const minDrawerWidth = 420
export const maxDrawerWidth = 760

export function emptyLocalTaskForm(repository = ''): LocalTaskForm {
  return {
    title: '',
    description: '',
    repository,
    assignee: '',
    branch: '',
    labels: '',
  }
}

export function storedClampedNumber(key: string, fallback: number, min: number, max: number) {
  const stored = window.localStorage.getItem(key)
  if (stored === null) {
    return fallback
  }

  const value = Number(stored)
  return Number.isFinite(value) ? clampNumberValue(value, min, max) : fallback
}

export function clampNumberValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

export function storedTheme(): 'dark' | 'light' {
  const fromQuery = new URLSearchParams(window.location.search).get('theme')
  if (fromQuery === 'dark' || fromQuery === 'light') {
    return fromQuery
  }

  const stored = window.localStorage.getItem(themeStorageKey)
  if (stored === 'dark' || stored === 'light') {
    return stored
  }

  return window.oratorioDesktop ? 'dark' : 'light'
}

export function parseBrief(description: string): BriefFields {
  const result: BriefFields = {
    summary: '',
    keyDetails: '',
    whyItMatters: '',
    desiredOutcome: '',
  }
  if (!description.trim()) {
    return result
  }

  const headings: Record<string, keyof BriefFields> = {
    summary: 'summary',
    'key details': 'keyDetails',
    'why it matters': 'whyItMatters',
    'desired outcome': 'desiredOutcome',
  }
  const buffers: Record<keyof BriefFields | 'preamble', string[]> = {
    summary: [],
    keyDetails: [],
    whyItMatters: [],
    desiredOutcome: [],
    preamble: [],
  }
  let current: keyof BriefFields | 'preamble' = 'preamble'

  for (const line of description.replace(/\r\n/g, '\n').split('\n')) {
    const headingMatch = line.match(/^#{2,4}\s+(.+?)\s*$/)
    if (headingMatch) {
      const matched = headings[headingMatch[1].trim().toLowerCase()]
      if (matched) {
        current = matched
        continue
      }
    }

    buffers[current].push(line)
  }

  for (const key of ['summary', 'keyDetails', 'whyItMatters', 'desiredOutcome'] as const) {
    result[key] = buffers[key].join('\n').trim()
  }
  if (!result.summary) {
    result.summary = buffers.preamble.join('\n').trim()
  }

  return result
}

export function defaultReviewStage(item: WorkItem, run?: Run): ReviewStageId {
  if (item.state === 'approved' || item.state === 'rejected' || item.state === 'archived') {
    return 'closed'
  }

  if (item.state === 'awaitingReview') {
    return item.reviewDrafts.length > 0 || item.followUpDrafts.length > 0 ? 'review' : 'decision'
  }

  if (item.state === 'dispatching' || item.state === 'running' || item.state === 'failed' || run) {
    return 'analysis'
  }

  return 'intake'
}

export function itemUrl(item: Pick<WorkItem, 'itemId' | 'sourceKey' | 'externalId'>) {
  if (item.itemId) {
    return `/items/id/${encodeURIComponent(item.itemId)}`
  }

  return sourceItemUrl(item)
}

export function sourceItemUrl(item: Pick<WorkItem, 'sourceKey' | 'externalId'>) {
  return `/items/${encodeURIComponent(item.sourceKey)}/${encodeURIComponent(item.externalId)}`
}

export function taskStatusFromState(state: ItemState): TaskStatus {
  if (state === 'discovered') return 'todo'
  if (state === 'dispatching' || state === 'running' || state === 'failed') return 'in_progress'
  if (state === 'awaitingReview') return 'in_review'
  if (state === 'approved') return 'done'
  return 'cancelled'
}

export function itemSummaryToWorkItem(item: ItemSummaryDto): WorkItem {
  return {
    id: item.itemId ?? `${item.source}:${item.externalId}`,
    itemId: item.itemId ?? null,
    sourceKey: item.source,
    externalId: item.externalId,
    currentRunId: null,
    type: itemKindToType(item.kind),
    kind: item.kind,
    number: externalNumber(item.externalId),
    title: item.title,
    description: '',
    repository: item.repository ?? 'local',
    source: sourceLabel(item.source),
    state: item.state,
    shortId: item.shortId ?? null,
    taskStatus: item.taskStatus ?? taskStatusFromState(item.state),
    boardSortOrder: item.boardSortOrder ?? 0,
    assignee: item.assignee ?? 'unassigned',
    branch: item.branch ?? 'no branch',
    updated: relativeTime(item.updatedAt),
    sourceUpdated: item.sourceUpdatedAt ? relativeTime(item.sourceUpdatedAt) : null,
    lastSourceSync: item.lastSourceSyncAt ? relativeTime(item.lastSourceSyncAt) : null,
    sourceState: item.sourceState ?? (item.source === 'github' ? 'open' : 'unknown'),
    sourceClosedAt: item.sourceClosedAt ?? null,
    sourceMergedAt: item.sourceMergedAt ?? null,
    archiveReason: item.archiveReason ?? null,
    sourceDetailsStatus: item.sourceDetailsStatus ?? (item.source === 'github' ? 'stale' : 'notRequired'),
    sourceDetailsHydratedAt: item.sourceDetailsHydratedAt ?? null,
    sourceDetailsErrorCode: item.sourceDetailsErrorCode ?? null,
    sourceDetailsErrorMessage: item.sourceDetailsErrorMessage ?? null,
    round: item.currentRound,
    severity: item.checkState === 'attention' || item.checkState === 'failing' ? 'high' : 'medium',
    check: item.checkState,
    summary: item.latestSummary ?? i18n.t('domain:summary.none'),
    externalUrl: item.externalUrl ?? null,
    labels: normalizeLabels(item.labels),
    isDraft: item.isDraft ?? false,
    headSha: item.headSha ?? null,
    sourceSnapshot: null,
    comments: [],
    sourceComments: [],
    sourceWrites: [],
    reviewDrafts: [],
    implementationDrafts: [],
    followUpDrafts: [],
    discussionTurns: [],
    rounds: [],
    decisions: [],
    runs: [],
    timeline: [],
    parentItemId: item.parentItemId ?? null,
    generatedFromDraftId: item.generatedFromDraftId ?? null,
  }
}

export function detailToWorkItem(detail: ItemDetailResponse): WorkItem {
  const base = itemSummaryToWorkItem(detail.item)
  const roundNumbers = new Map((detail.rounds ?? []).map((round) => [round.roundId, round.roundNumber]))
  const rounds = (detail.rounds ?? []).map(roundToModel)
  return {
    ...base,
    description: detail.item.description ?? '',
    currentRunId: detail.item.currentRunId,
    itemId: detail.item.itemId,
    sourceSnapshot: detail.sourceSnapshot ?? null,
    comments: (detail.comments ?? []).filter((comment) => !isSourceComment(comment)),
    sourceComments: (detail.comments ?? []).filter(isSourceComment).map(commentToSourceComment),
    sourceWrites: (detail.sourceWrites ?? []).map(sourceWriteToModel),
    reviewDrafts: (detail.reviewDrafts ?? []).map(reviewDraftToModel),
    implementationDrafts: detail.implementationDrafts ?? [],
    followUpDrafts: detail.followUpDrafts ?? [],
    discussionTurns: detail.discussionTurns ?? [],
    rounds,
    decisions: (detail.decisions ?? []).map(decisionToModel),
    runs: detail.runs.map(runToModel),
    timeline: detail.timeline.map((event) => timelineToEvent(event, roundNumbers.get(event.roundId ?? '') ?? detail.item.currentRound)),
  }
}

export function reviewDraftToModel(draft: ReviewDraftDto): ReviewDraft {
  return {
    ...draft,
    comments: draft.comments ?? [],
  }
}

export function roundToModel(round: RoundDto): Round {
  return {
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    status: round.status,
    summary: round.summary,
    createdAt: round.createdAt,
    completedAt: round.completedAt,
  }
}

export function runToModel(run: RunDto): Run {
  return {
    runId: run.runId,
    roundId: run.roundId,
    attempt: run.attempt,
    status: run.status,
    runnerKind: run.runnerKind,
    threadId: run.threadId,
    turnId: run.turnId,
    appServerEndpoint: run.appServerEndpoint ?? null,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    summary: run.summary,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    progressPercent: run.progressPercent,
    statusMessage: run.statusMessage,
    lastHeartbeatAt: run.lastHeartbeatAt,
    baseWorkspacePath: run.baseWorkspacePath,
    worktreePath: run.worktreePath,
    worktreeBranch: run.worktreeBranch,
    baseRef: run.baseRef,
    baseSha: run.baseSha,
    worktreeStatus: run.worktreeStatus,
    worktreeErrorCode: run.worktreeErrorCode,
    worktreeErrorMessage: run.worktreeErrorMessage,
    retryCount: run.retryCount,
    nextRetryAt: run.nextRetryAt,
    leaseOwner: run.leaseOwner,
    leaseAcquiredAt: run.leaseAcquiredAt,
    worktreeCleanupAfterAt: run.worktreeCleanupAfterAt,
    worktreeCleanedAt: run.worktreeCleanedAt,
    purpose: run.purpose ?? 'reviewAnalysis',
    dispatchTrigger: run.dispatchTrigger ?? 'manual',
    targetHeadSha: run.targetHeadSha ?? null,
    deliveryPolicy: run.deliveryPolicy ?? 'manualDelivery',
    implementationTurnCount: run.implementationTurnCount ?? 0,
  }
}

export function decisionToModel(decision: DecisionDto): Decision {
  return {
    decisionId: decision.decisionId,
    roundId: decision.roundId,
    decision: decision.decision,
    authorName: decision.authorName,
    commentId: decision.commentId,
    body: decision.body,
    createdAt: decision.createdAt,
  }
}

export function buildRoundHistory(item: WorkItem): RoundHistory[] {
  return item.rounds.map((round) => ({
    round,
    runs: item.runs.filter((run) => run.roundId === round.roundId),
    decisions: item.decisions.filter((decision) => decision.roundId === round.roundId),
    comments: item.comments.filter((comment) => comment.roundId === round.roundId && !isSourceComment(comment)),
    events: item.timeline.filter((event) => event.roundId === round.roundId),
  }))
}

export function latestRun(item: WorkItem) {
  if (item.currentRunId) {
    const current = item.runs.find((run) => run.runId === item.currentRunId)
    if (current) {
      return current
    }
  }

  return item.runs[item.runs.length - 1]
}

export function itemHasActiveRun(item: WorkItem) {
  const run = latestRun(item)
  return item.state === 'dispatching' || item.state === 'running' || (run ? isActiveRun(run.status) : false)
}

export function isActiveRun(status: RunStatus) {
  return status === 'queued' || status === 'dispatching' || status === 'running'
}

function timestampValue(value: string | null | undefined) {
  return value ? Date.parse(value) || 0 : 0
}

export function pullRequestReReviewInfo(item: WorkItem | null | undefined): ReReviewInfo | null {
  if (!item || (item.sourceKey !== 'github' && item.sourceKey !== 'gitlab') || item.kind !== 'pullRequest' || !item.headSha) {
    return null
  }

  if (item.state === 'dispatching' || item.state === 'running' || item.state === 'rejected' || item.state === 'archived') {
    return null
  }

  const latestSuccessfulReview = item.runs
    .filter((run) => run.runnerKind === 'appServer' && run.status === 'succeeded' && run.purpose === 'reviewAnalysis' && Boolean(run.baseSha))
    .sort((left, right) => timestampValue(right.completedAt ?? right.startedAt) - timestampValue(left.completedAt ?? left.startedAt))[0]
  const previousHeadSha = latestSuccessfulReview?.baseSha
  if (!previousHeadSha || previousHeadSha.toLowerCase() === item.headSha.toLowerCase()) {
    return null
  }

  return {
    previousHeadSha,
    currentHeadSha: item.headSha,
    description: i18n.t('domain:reReview.description', { from: shortSha(previousHeadSha), to: shortSha(item.headSha) }),
  }
}

export function isSourceComment(comment: CommentDto) {
  return Boolean(comment.purpose === 'sourceContext' || comment.source || comment.sourceCommentId || comment.externalUrl)
}

export function commentToSourceComment(comment: CommentDto): SourceComment {
  return {
    id: comment.commentId,
    author: comment.authorName,
    body: comment.body,
    source: sourceLabel(comment.source ?? 'github'),
    time: timeLabel(comment.createdAt),
    externalUrl: comment.externalUrl ?? null,
    sourceUpdatedAt: comment.sourceUpdatedAt ?? null,
  }
}

export function sourceWriteToModel(write: SourceWriteDto): SourceWrite {
  return {
    writeId: write.writeId,
    kind: write.kind,
    intent: write.intent,
    status: write.status,
    repository: write.repository ?? 'github',
    number: write.number,
    externalUrl: write.externalUrl,
    attemptCount: write.attemptCount,
    errorCode: write.errorCode,
    errorMessage: write.errorMessage,
    updated: relativeTime(write.updatedAt),
  }
}

export function normalizeLabels(labels: ItemSummaryDto['labels']) {
  if (Array.isArray(labels)) {
    return labels.filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
  }

  return []
}

export function labelsFromInput(value: string) {
  return value
    .split(',')
    .map((label) => label.trim())
    .filter((label, index, labels) => label.length > 0 && labels.indexOf(label) === index)
}

export function localTaskAssigneeOptions(items: Array<Pick<WorkItem, 'assignee'>>, max = 6) {
  return uniqueRecentOptions(
    items.map((item) => item.assignee),
    new Set(['unassigned']),
    max,
  )
}

export function localTaskBranchOptions(items: Array<Pick<WorkItem, 'branch' | 'repository'>>, repository: string, max = 6) {
  const normalizedRepository = repository.trim().toLowerCase()
  const scoped = normalizedRepository
    ? items
        .filter((item) => item.repository.trim().toLowerCase() === normalizedRepository)
        .map((item) => item.branch)
    : []
  const global = items.map((item) => item.branch)
  return uniqueRecentOptions([...scoped, ...global, 'main'], new Set(['no branch']), max)
}

function uniqueRecentOptions(values: string[], ignored: Set<string>, max: number) {
  const seen = new Set<string>()
  const options: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || ignored.has(key) || seen.has(key)) {
      continue
    }

    seen.add(key)
    options.push(trimmed)
    if (options.length >= max) {
      break
    }
  }

  return options
}

export function optionalValue(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function sourceMetaLabel(item: WorkItem) {
  if (item.sourceKey === 'local') {
    return item.labels.length ? i18n.t('domain:sourceMeta.labels', { count: item.labels.length }) : i18n.t('domain:sourceMeta.localTask')
  }

  const lifecycle = item.sourceState === 'merged' ? i18n.t('domain:sourceMeta.mergedPrefix') : item.sourceState === 'closed' ? i18n.t('domain:sourceMeta.closedPrefix') : ''
  return `${lifecycle}${item.isDraft ? i18n.t('domain:sourceMeta.draftPrefix') : ''}${item.headSha ? `${shortSha(item.headSha)} · ` : ''}${
    item.lastSourceSync ? i18n.t('domain:sourceMeta.synced', { value: item.lastSourceSync }) : i18n.t('domain:sourceMeta.notSynced')
  }`
}

export function sourceLifecycleBadge(item: WorkItem) {
  if (item.sourceKey === 'local' || item.sourceState === 'open' || item.sourceState === 'unknown') {
    return null
  }

  return (
    <Tooltip content={sourceLifecycleTitle(item)}>
      <span className={`source-lifecycle ${item.sourceState}`}>
        {item.sourceState === 'merged' ? <GitCommit size={12} /> : <Archive size={12} />}
        <span className="chip-text">{sourceLifecycleLabel(item.sourceState)}</span>
      </span>
    </Tooltip>
  )
}

export function queueLabelBadges(item: WorkItem) {
  if (item.labels.length === 0) {
    return null
  }

  const visibleCount = item.sourceState === 'open' || item.sourceState === 'unknown' ? 2 : 1
  const visibleLabels = item.labels.slice(0, visibleCount)
  const hiddenCount = item.labels.length - visibleLabels.length

  return (
    <>
      {visibleLabels.map((label) => (
        <Tooltip content={i18n.t('domain:queueLabel.tooltip', { label })} key={label}>
          <span className="queue-label-chip">
            <Tag size={12} />
            <span className="chip-text">{label}</span>
          </span>
        </Tooltip>
      ))}
      {hiddenCount > 0 ? (
        <Tooltip content={item.labels.join(', ')}>
          <span className="queue-label-count">
            +{hiddenCount}
          </span>
        </Tooltip>
      ) : null}
    </>
  )
}

export function sourceLifecycleLabel(state: SourceState) {
  if (state === 'merged') return i18n.t('domain:sourceLifecycle.merged')
  if (state === 'closed') return i18n.t('domain:sourceLifecycle.closed')
  if (state === 'open') return i18n.t('domain:sourceLifecycle.open')
  return i18n.t('domain:sourceLifecycle.unknown')
}

export function sourceLifecycleTitle(item: WorkItem) {
  const timestamp = item.sourceState === 'merged' ? item.sourceMergedAt : item.sourceClosedAt
  const label = sourceLifecycleLabel(item.sourceState)
  return timestamp ? i18n.t('domain:sourceLifecycle.titleOn', { label, date: new Date(timestamp).toLocaleString(i18n.language) }) : label
}

export function taskStatusLabel(status: TaskStatus) {
  return i18n.t(`domain:taskStatus.${status}.label`)
}

export function taskStatusBadgeClass(status: TaskStatus) {
  if (status === 'in_progress') return 'running'
  if (status === 'in_review') return 'awaiting-review'
  if (status === 'done') return 'approved'
  if (status === 'cancelled') return 'archived'
  return 'discovered'
}

export function microStatusDot(item: WorkItem) {
  if (item.state === 'dispatching' || item.state === 'running') {
    return { kind: 'running', label: i18n.t('domain:microStatus.runActive'), className: 'running' }
  }

  if (item.state === 'awaitingReview' || item.check === 'attention') {
    return { kind: 'awaiting-approval', label: i18n.t('domain:microStatus.awaitingReview'), className: 'awaiting-review' }
  }

  if (item.state === 'failed' || item.check === 'failing') {
    return { kind: 'error', label: i18n.t('domain:microStatus.needsAttention'), className: 'failed' }
  }

  return { kind: 'idle', label: i18n.t('domain:microStatus.idle'), className: 'idle' }
}

export function sourceIcon(item: Pick<WorkItem, 'type'>) {
  if (item.type === 'pr') return <GitPullRequest size={14} />
  if (item.type === 'task') return <CircleDot size={14} />
  return <CircleDot size={14} />
}

export function summaryPreviewLines(value: string) {
  const lines = normalizeMarkdownForDisplay(value)
    .split('\n')
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, '')
        .replace(/^[-*]\s+/, '')
        .replace(/`([^`]+)`/g, '$1'),
    )
    .map(stripMarkdownInline)
    .filter((line) => line && !line.includes('|') && !/^[-: ]+$/.test(line))

  const useful = lines.filter(
    (line) =>
      !/^oratorio review analysis/i.test(line) &&
      !/^assessment$/i.test(line) &&
      !/^field$/i.test(line) &&
      !/^value$/i.test(line),
  )
  const preview = useful.slice(0, 3)
  return preview.length > 0 ? preview : [i18n.t('domain:summary.previewFallback')]
}

export function stripMarkdownInline(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\\([*_`[\]()#>])/g, '$1')
    .trim()
}

export function technicalPreview(value: string) {
  const firstLine = normalizeMarkdownForDisplay(value)
    .split('\n')
    .map(stripMarkdownInline)
    .find((line) => line.length > 0)
  if (!firstLine) return i18n.t('domain:summary.technicalFallback')
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine
}

export function timelineToEvent(event: TimelineEventDto, currentRound: number): TimelineEvent {
  return {
    id: event.eventId,
    roundId: event.roundId,
    runId: event.runId,
    kind: timelineKind(event.kind),
    actor: event.actorName,
    title: event.title,
    body: event.body ?? '',
    time: timeLabel(event.createdAt),
    round: currentRound,
    suggestion: mockSuggestion(event),
  }
}

export function mockSuggestion(event: TimelineEventDto) {
  if (event.title !== 'Inline suggestion prepared') {
    return undefined
  }

  return {
    file: 'src/Auth/RefreshTokenStore.cs',
    lines: 'L88-L91',
    replacement:
      'return CryptographicOperations.FixedTimeEquals(\n    expectedHash,\n    actualHash);',
  }
}

export function isTechnicalTimelineEvent(event: TimelineEvent) {
  const title = event.title.toLowerCase()
  if (event.kind === 'check') {
    return true
  }

  return (
    title.includes('queued') ||
    title.includes('started') ||
    title.includes('pending') ||
    title.includes('waiting') ||
    title.includes('passed') ||
    title.includes('source synced') ||
    title.includes('source updated') ||
    title.includes('write queued')
  )
}

export function itemKindToType(kind: ItemKind): ItemType {
  if (kind === 'pullRequest') return 'pr'
  if (kind === 'issue') return 'issue'
  return 'task'
}

export function externalNumber(externalId: string) {
  const match = externalId.match(/(\d+)$/)
  return match ? `#${match[1]}` : externalId
}

export function shortSha(value: string) {
  return value.length > 7 ? value.slice(0, 7) : value
}

export function shortThreadId(value: string) {
  const prefix = 'thread_'
  if (value.toLowerCase().startsWith(prefix) && value.length > prefix.length) {
    return `${value.slice(0, prefix.length)}${value.slice(prefix.length, prefix.length + 8)}`
  }

  return shortId(value)
}

export function shortId(value: string) {
  return value.length > 12 ? value.slice(0, 12) : value
}

export function sourceLabel(source: string) {
  if (source === 'local') return i18n.t('domain:source.local')
  if (source === 'github') return i18n.t('domain:source.github')
  if (source === 'gitlab') return i18n.t('domain:source.gitlab')
  return source
}

export function relativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return value
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (diffSeconds < 60) return i18n.t('domain:time.justNow')
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return i18n.t('domain:time.minutesAgo', { count: diffMinutes })
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return i18n.t('domain:time.hoursAgo', { count: diffHours })
  return new Date(value).toLocaleDateString(i18n.language)
}

export function timeLabel(value: string) {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return value
  }

  return timestamp.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
}

export function sourceSnapshotLabel(snapshot: SourceSnapshotDto | null) {
  if (!snapshot) {
    return i18n.t('domain:sourceSnapshot.none')
  }

  const syncedAt = snapshot.syncedAt ? relativeTime(snapshot.syncedAt) : i18n.t('domain:sourceSnapshot.synced')
  return snapshot.headSha ? `${shortSha(snapshot.headSha)} · ${syncedAt}` : syncedAt
}

export function timelineKind(kind: string): TimelineKind {
  if (kind === 'commentAdded') return 'comment'
  if (kind === 'decisionRecorded' || kind === 'itemReopened') return 'decision'
  if (kind === 'itemUpdated' || kind === 'itemArchived') return 'item'
  if (kind === 'sourceWriteQueued' || kind === 'sourceWriteSucceeded' || kind === 'sourceWriteFailed') return 'source'
  if (kind === 'checkUpdated') return 'check'
  if (kind === 'runQueued' || kind === 'runStarted' || kind === 'runCompleted' || kind === 'runFailed') return 'agent'
  return 'source'
}

export function sourceWriteKindLabel(kind: SourceWriteKind) {
  if (kind === 'pullRequestReview') return i18n.t('domain:sourceWriteKind.pullRequestReview')
  if (kind === 'checkRun') return i18n.t('domain:sourceWriteKind.checkRun')
  if (kind === 'localCommit') return i18n.t('domain:sourceWriteKind.localCommit')
  if (kind === 'branchPush') return i18n.t('domain:sourceWriteKind.branchPush')
  if (kind === 'pullRequestCreation') return i18n.t('domain:sourceWriteKind.pullRequestCreation')
  if (kind === 'mergeRequestNote') return i18n.t('domain:sourceWriteKind.mergeRequestNote')
  if (kind === 'mergeRequestDiscussion') return i18n.t('domain:sourceWriteKind.mergeRequestDiscussion')
  if (kind === 'commitStatus') return i18n.t('domain:sourceWriteKind.commitStatus')
  if (kind === 'mergeRequestCreation') return i18n.t('domain:sourceWriteKind.mergeRequestCreation')
  return i18n.t('domain:sourceWriteKind.issueComment')
}

export function sourceWriteStatusLabel(status: SourceWriteStatus) {
  if (status === 'succeeded') return i18n.t('domain:sourceWriteStatus.succeeded')
  if (status === 'failed') return i18n.t('domain:sourceWriteStatus.failed')
  return i18n.t('domain:sourceWriteStatus.pending')
}

export function reviewDraftStatusLabel(status: ReviewDraftStatus) {
  if (status === 'published') return i18n.t('domain:reviewDraftStatus.published')
  if (status === 'discarded') return i18n.t('domain:reviewDraftStatus.discarded')
  if (status === 'publishFailed') return i18n.t('domain:reviewDraftStatus.publishFailed')
  return i18n.t('domain:reviewDraftStatus.draft')
}

export function implementationDraftStatusLabel(status: ImplementationDraftStatus) {
  if (status === 'delivered') return i18n.t('domain:implementationDraftStatus.delivered')
  if (status === 'deliveryFailed') return i18n.t('domain:implementationDraftStatus.deliveryFailed')
  return i18n.t('domain:implementationDraftStatus.draft')
}

export function canDeliverImplementationDraft(draft: ImplementationDraft) {
  return draft.status === 'draft' || draft.status === 'deliveryFailed'
}

export function followUpDraftStatusLabel(status: FollowUpDraftStatus) {
  if (status === 'created') return i18n.t('domain:followUpDraftStatus.created')
  if (status === 'discarded') return i18n.t('domain:followUpDraftStatus.discarded')
  return i18n.t('domain:followUpDraftStatus.draft')
}

export function deliveryPolicyLabel(policy: DeliveryPolicy) {
  return policy === 'autoPr' ? i18n.t('domain:deliveryPolicy.autoPr') : i18n.t('domain:deliveryPolicy.manualDelivery')
}

export function sourceWriteIntentLabel(intent: string) {
  if (intent === 'requestChanges') return i18n.t('domain:sourceWriteIntent.requestChanges')
  return intent
}

export function decisionLabel(decision: 'approve' | 'request-changes' | 'reject') {
  if (decision === 'approve') return i18n.t('domain:decision.approve')
  if (decision === 'reject') return i18n.t('domain:decision.reject')
  return i18n.t('domain:decision.changesRequested')
}

export function decisionHistoryLabel(decision: Decision['decision']) {
  if (decision === 'approve') return i18n.t('domain:decisionHistory.approve')
  if (decision === 'reject') return i18n.t('domain:decisionHistory.reject')
  if (decision === 'reopen') return i18n.t('domain:decisionHistory.reopen')
  if (decision === 'reReview') return i18n.t('domain:decisionHistory.reReview')
  return i18n.t('domain:decisionHistory.changesRequested')
}

export function decisionIcon(decision: Decision['decision']) {
  if (decision === 'approve') return <CheckCircle2 size={15} />
  if (decision === 'reject') return <XCircle size={15} />
  if (decision === 'reopen') return <RotateCcw size={15} />
  if (decision === 'reReview') return <GitPullRequest size={15} />
  return <AlertTriangle size={15} />
}

export function roundStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: i18n.t('domain:roundStatus.open'),
    running: i18n.t('domain:roundStatus.running'),
    awaitingReview: i18n.t('domain:roundStatus.awaitingReview'),
    changesRequested: i18n.t('domain:roundStatus.changesRequested'),
    superseded: i18n.t('domain:roundStatus.superseded'),
    approved: i18n.t('domain:roundStatus.approved'),
    rejected: i18n.t('domain:roundStatus.rejected'),
    failed: i18n.t('domain:roundStatus.failed'),
  }
  return labels[status] ?? status
}

export function runnerModeLabel(mode: RunnerMode) {
  return mode === 'appServer' ? i18n.t('domain:runnerMode.appServer') : i18n.t('domain:runnerMode.mock')
}

export function dotcraftHealthMessage(health: DotCraftHealth) {
  if (health === 'connected') return i18n.t('domain:dotcraftHealth.connected')
  if (health === 'configured') return i18n.t('domain:dotcraftHealth.configured')
  return i18n.t('domain:dotcraftHealth.notConfigured')
}

export function dotcraftStatusClass(status: DotCraftStatus) {
  if (status.health === 'connected' || status.connected) return 'approved'
  if (status.health === 'configured' || status.configured) return 'awaiting-review'
  return 'failed'
}

export function workspaceStatusClass(workspace: DotCraftWorkspace) {
  if (workspace.health === 'connected' || workspace.connected) return 'approved'
  if (workspace.health === 'configured' || workspace.configured) return 'awaiting-review'
  return 'failed'
}

export function githubStatusClass(status: GitHubSourceStatus) {
  if (status.configured) return 'approved'
  if (status.available) return 'awaiting-review'
  return 'failed'
}

export function githubSourceStatusLabel(status: GitHubSourceStatus) {
  if (status.configured) return i18n.t('domain:githubSourceStatus.configured')
  if (status.available) return i18n.t('domain:githubSourceStatus.available')
  return i18n.t('domain:githubSourceStatus.unavailable')
}

export function runnerKindLabel(kind: string) {
  return kind === 'appServer' ? i18n.t('domain:runnerMode.appServer') : kind
}

export function runStatusLabel(status: RunStatus) {
  return i18n.t(`domain:runStatus.${status}`)
}

export function worktreeStatusLabel(status: WorktreeStatus) {
  return i18n.t(`domain:worktreeStatus.${status}`)
}

export function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : i18n.t('domain:errorFallback')
}

export function checkLabel(check: CheckState) {
  if (check === 'passing') return i18n.t('domain:check.passing')
  if (check === 'failing' || check === 'attention') return i18n.t('domain:check.attention')
  if (check === 'pending') return i18n.t('domain:check.running')
  return i18n.t('domain:check.notConfigured')
}

export function checkIcon(check: CheckState) {
  if (check === 'passing') return <CheckCircle2 size={18} />
  if (check === 'failing' || check === 'attention') return <AlertTriangle size={18} />
  if (check === 'pending') return <Clock3 size={18} />
  return <CircleDot size={18} />
}

export function cardCheckBadge(item: WorkItem) {
  if (item.check === 'notConfigured') {
    return null
  }

  if (item.check === 'pending' && (item.state === 'dispatching' || item.state === 'running')) {
    return null
  }

  return (
    <Tooltip content={`oratorio/review: ${checkLabel(item.check)}`}>
      <span className={`mini-check ${item.check}`}>
        {checkIcon(item.check)}
        <span className="chip-text">{checkLabel(item.check)}</span>
      </span>
    </Tooltip>
  )
}

export function cardStateBadge(item: WorkItem) {
  // Column + state dot + accent bar already carry these states; the pill would only echo the column.
  if (item.state === 'discovered' || item.state === 'awaitingReview' || item.state === 'approved') {
    return null
  }

  if (item.state === 'running') {
    return (
      <Tooltip content={i18n.t('domain:state.running')}>
        <span className="state-spinner" role="img" aria-label={i18n.t('domain:state.running')}>
          <LoaderCircle size={14} className="spin-icon" />
        </span>
      </Tooltip>
    )
  }

  return <span className={`state-pill ${stateClassName(item.state)}`}>{stateLabel(item.state)}</span>
}

export function stateFilterIcon(tab: 'all' | ItemState) {
  if (tab === 'all') return <ListFilter size={16} />
  if (tab === 'awaitingReview') return <Eye size={16} />
  if (tab === 'running' || tab === 'dispatching') return <Activity size={16} />
  if (tab === 'discovered') return <CircleDot size={16} />
  if (tab === 'approved') return <CheckCircle2 size={16} />
  if (tab === 'archived') return <Archive size={16} />
  return <XCircle size={16} />
}

export function stateCopy(state: ItemState) {
  if (state === 'archived') return i18n.t('domain:stateCopy.archived')
  if (state === 'running' || state === 'dispatching') return i18n.t('domain:stateCopy.running')
  if (state === 'awaitingReview') return i18n.t('domain:stateCopy.awaitingReview')
  if (state === 'approved') return i18n.t('domain:stateCopy.approved')
  if (state === 'rejected') return i18n.t('domain:stateCopy.rejected')
  if (state === 'failed') return i18n.t('domain:stateCopy.failed')
  return i18n.t('domain:stateCopy.eligible')
}

export function stateIcon(state: ItemState) {
  if (state === 'running' || state === 'dispatching') return <Clock3 size={18} />
  if (state === 'awaitingReview') return <AlertTriangle size={18} />
  if (state === 'approved') return <ShieldCheck size={18} />
  if (state === 'archived') return <Archive size={18} />
  if (state === 'rejected' || state === 'failed') return <XCircle size={18} />
  return <CircleDot size={18} />
}

export function timelineIcon(kind: TimelineKind) {
  if (kind === 'agent') return <Activity size={15} />
  if (kind === 'comment') return <MessageSquare size={15} />
  if (kind === 'decision') return <ShieldCheck size={15} />
  if (kind === 'check') return <CheckCircle2 size={15} />
  if (kind === 'item') return <Archive size={15} />
  return <GitPullRequest size={15} />
}

export function stateClassName(state: ItemState) {
  if (state === 'awaitingReview') return 'awaiting-review'
  return state
}
