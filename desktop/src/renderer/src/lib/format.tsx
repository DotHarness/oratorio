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

export const stateLabels: Record<ItemState, string> = {
  discovered: 'Discovered',
  dispatching: 'Dispatching',
  running: 'Running',
  awaitingReview: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
  failed: 'Failed',
  archived: 'Archived',
}

export const stateTabs: Array<'all' | ItemState> = ['all', 'awaitingReview', 'running', 'discovered', 'approved', 'archived']
export const taskStatusColumns: Array<{ id: TaskStatus; label: string; description: string }> = [
  { id: 'todo', label: 'To do', description: 'Ready to triage or dispatch.' },
  { id: 'in_progress', label: 'In progress', description: 'Queued, running, or awaiting retry.' },
  { id: 'in_review', label: 'In review', description: 'Agent work is ready for judgment.' },
  { id: 'done', label: 'Done', description: 'Accepted outcomes.' },
  { id: 'cancelled', label: 'Cancelled', description: 'Rejected or archived tasks.' },
]
export const activeTaskStatusColumns = taskStatusColumns.filter((column) => column.id !== 'cancelled')
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
    summary: item.latestSummary ?? 'No agent summary is available yet.',
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
    description: `Review target moved from ${shortSha(previousHeadSha)} to ${shortSha(item.headSha)} since the last Oratorio review.`,
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
    return item.labels.length ? `${item.labels.length} labels` : 'local task'
  }

  const lifecycle = item.sourceState === 'merged' ? 'Merged · ' : item.sourceState === 'closed' ? 'Closed · ' : ''
  return `${lifecycle}${item.isDraft ? 'Draft · ' : ''}${item.headSha ? `${shortSha(item.headSha)} · ` : ''}${
    item.lastSourceSync ? `synced ${item.lastSourceSync}` : 'not synced'
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
        <Tooltip content={`Label: ${label}`} key={label}>
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
  if (state === 'merged') return 'Merged'
  if (state === 'closed') return 'Closed'
  if (state === 'open') return 'Open'
  return 'Unknown'
}

export function sourceLifecycleTitle(item: WorkItem) {
  const timestamp = item.sourceState === 'merged' ? item.sourceMergedAt : item.sourceClosedAt
  return `${sourceLifecycleLabel(item.sourceState)}${timestamp ? ` on ${new Date(timestamp).toLocaleString()}` : ''}`
}

export function taskStatusLabel(status: TaskStatus) {
  return taskStatusColumns.find((column) => column.id === status)?.label ?? status
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
    return { kind: 'running', label: 'Run active', className: 'running' }
  }

  if (item.state === 'awaitingReview' || item.check === 'attention') {
    return { kind: 'awaiting-approval', label: 'Awaiting review', className: 'awaiting-review' }
  }

  if (item.state === 'failed' || item.check === 'failing') {
    return { kind: 'error', label: 'Needs attention', className: 'failed' }
  }

  return { kind: 'idle', label: 'Idle', className: 'idle' }
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
  return preview.length > 0 ? preview : ['Agent output is ready. Open technical details for the full report.']
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
  if (!firstLine) return 'No additional details.'
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
  if (source === 'local') return 'Local'
  if (source === 'github') return 'GitHub'
  if (source === 'gitlab') return 'GitLab'
  return source
}

export function relativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) {
    return value
  }

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (diffSeconds < 60) return 'just now'
  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr ago`
  return new Date(value).toLocaleDateString()
}

export function timeLabel(value: string) {
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return value
  }

  return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function sourceSnapshotLabel(snapshot: SourceSnapshotDto | null) {
  if (!snapshot) {
    return 'None'
  }

  const syncedAt = snapshot.syncedAt ? relativeTime(snapshot.syncedAt) : 'synced'
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
  if (kind === 'pullRequestReview') return 'PR review'
  if (kind === 'checkRun') return 'Check run'
  if (kind === 'localCommit') return 'Local commit'
  if (kind === 'branchPush') return 'Branch push'
  if (kind === 'pullRequestCreation') return 'PR creation'
  if (kind === 'mergeRequestNote') return 'MR note'
  if (kind === 'mergeRequestDiscussion') return 'MR discussion'
  if (kind === 'commitStatus') return 'Commit status'
  if (kind === 'mergeRequestCreation') return 'MR creation'
  return 'Issue comment'
}

export function sourceWriteStatusLabel(status: SourceWriteStatus) {
  if (status === 'succeeded') return 'Succeeded'
  if (status === 'failed') return 'Failed'
  return 'Pending'
}

export function reviewDraftStatusLabel(status: ReviewDraftStatus) {
  if (status === 'published') return 'Published'
  if (status === 'discarded') return 'Discarded'
  if (status === 'publishFailed') return 'Publish failed'
  return 'Draft'
}

export function implementationDraftStatusLabel(status: ImplementationDraftStatus) {
  if (status === 'delivered') return 'Delivered'
  if (status === 'deliveryFailed') return 'Delivery failed'
  return 'Draft'
}

export function canDeliverImplementationDraft(draft: ImplementationDraft) {
  return draft.status === 'draft' || draft.status === 'deliveryFailed'
}

export function followUpDraftStatusLabel(status: FollowUpDraftStatus) {
  if (status === 'created') return 'Created'
  if (status === 'discarded') return 'Discarded'
  return 'Draft'
}

export function deliveryPolicyLabel(policy: DeliveryPolicy) {
  return policy === 'autoPr' ? 'Auto PR' : 'Manual delivery'
}

export function sourceWriteIntentLabel(intent: string) {
  if (intent === 'requestChanges') return 'request changes'
  return intent
}

export function decisionLabel(decision: 'approve' | 'request-changes' | 'reject') {
  if (decision === 'approve') return 'Approved'
  if (decision === 'reject') return 'Rejected'
  return 'Changes requested'
}

export function decisionHistoryLabel(decision: Decision['decision']) {
  if (decision === 'approve') return 'Approved'
  if (decision === 'reject') return 'Rejected'
  if (decision === 'reopen') return 'Reopened'
  if (decision === 'reReview') return 'Re-review requested'
  return 'Changes requested'
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
    open: 'Open',
    running: 'Running',
    awaitingReview: 'Awaiting review',
    changesRequested: 'Changes requested',
    superseded: 'Superseded',
    approved: 'Approved',
    rejected: 'Rejected',
    failed: 'Failed',
  }
  return labels[status] ?? status
}

export function runnerModeLabel(mode: RunnerMode) {
  return mode === 'appServer' ? 'DotCraft' : 'Mock'
}

export function dotcraftHealthMessage(health: DotCraftHealth) {
  if (health === 'connected') return 'DotCraft AppServer is reachable.'
  if (health === 'configured') return 'DotCraft AppServer is configured but not reachable.'
  return 'DotCraft AppServer is not configured.'
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
  if (status.configured) return 'Configured'
  if (status.available) return 'Available'
  return 'Unavailable'
}

export function runnerKindLabel(kind: string) {
  return kind === 'appServer' ? 'DotCraft' : kind
}

export function runStatusLabel(status: RunStatus) {
  if (status === 'timedOut') return 'Timed out'
  return status[0].toUpperCase() + status.slice(1)
}

export function worktreeStatusLabel(status: WorktreeStatus) {
  if (status === 'notRequired') return 'Not required'
  if (status === 'cleanupPending') return 'Cleanup pending'
  return status[0].toUpperCase() + status.slice(1)
}

export function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Unexpected Oratorio API error.'
}

export function checkLabel(check: CheckState) {
  if (check === 'passing') return 'Passing'
  if (check === 'failing' || check === 'attention') return 'Attention'
  if (check === 'pending') return 'Running'
  return 'Not configured'
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
      <Tooltip content="Running">
        <span className="state-spinner" role="img" aria-label="Running">
          <LoaderCircle size={14} className="spin-icon" />
        </span>
      </Tooltip>
    )
  }

  return <span className={`state-pill ${stateClassName(item.state)}`}>{stateLabels[item.state]}</span>
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
  if (state === 'archived') return 'This local task is hidden from the default queue until it is reopened.'
  if (state === 'running' || state === 'dispatching') return 'A round is in progress and the review check is pending.'
  if (state === 'awaitingReview') return 'Agent output is ready for operator judgment.'
  if (state === 'approved') return 'This item has satisfied the current Oratorio review policy.'
  if (state === 'rejected') return 'The item is stopped until an operator reopens it.'
  if (state === 'failed') return 'The last run failed and needs an operator decision.'
  return 'This item is eligible for a new Oratorio round.'
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
