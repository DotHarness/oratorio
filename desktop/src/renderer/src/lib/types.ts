import type { ReactNode } from 'react'

export type ItemState =
  | 'discovered'
  | 'dispatching'
  | 'running'
  | 'awaitingReview'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'archived'
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
export type ItemKind = 'issue' | 'pullRequest' | 'localTask'
export type ItemType = 'pr' | 'issue' | 'task'
export type TimelineKind = 'source' | 'agent' | 'comment' | 'decision' | 'check' | 'item'
export type CheckState = 'notConfigured' | 'pending' | 'attention' | 'passing' | 'failing'
export type SourceState = 'open' | 'closed' | 'merged' | 'unknown'
export type SourceDetailsStatus = 'notRequired' | 'stale' | 'current' | 'failed'
export type ArchiveReason = 'manual' | 'sourceClosed' | 'sourceMerged'
export type DotCraftHealth = 'connected' | 'configured' | 'unavailable'
export type RunStatus = 'queued' | 'dispatching' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timedOut'
export type WorktreeStatus = 'notRequired' | 'preparing' | 'ready' | 'cleanupPending' | 'cleaned' | 'failed'
export type MockOutcome = 'success' | 'fail' | 'timeout'
export type RunnerMode = 'appServer' | 'mock'
export type SourceWriteKind =
  | 'issueComment'
  | 'pullRequestReview'
  | 'checkRun'
  | 'localCommit'
  | 'branchPush'
  | 'pullRequestCreation'
  | 'mergeRequestNote'
  | 'mergeRequestDiscussion'
  | 'commitStatus'
  | 'mergeRequestCreation'
export type SourceWriteStatus = 'pending' | 'succeeded' | 'failed'
export type ReviewDraftStatus = 'draft' | 'published' | 'discarded' | 'publishFailed'
export type ReviewDraftCommentStatus = 'accepted' | 'skipped'
export type ReviewFindingResolutionState = 'open' | 'resolved'
export type ReviewFindingResolutionKind = 'fixed' | 'dismissed'
export type RunPurpose = 'reviewAnalysis' | 'implementation'
export type RunDispatchTrigger = 'manual' | 'appBinding' | 'autoImplementation' | 'autoReview'
export type DeliveryPolicy = 'manualDelivery' | 'autoPr'
export type ImplementationDraftStatus = 'draft' | 'delivered' | 'deliveryFailed'
export type FollowUpDraftStatus = 'draft' | 'created' | 'discarded'
export type CommentPurpose = 'feedback' | 'discussionQuestion' | 'discussionReply' | 'sourceContext' | 'systemNote'
export type DiscussionTurnStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type ReviewStageId = 'intake' | 'analysis' | 'review' | 'decision' | 'closed'

export type ItemSummaryDto = {
  itemId?: string | null
  source: string
  externalId: string
  kind: ItemKind
  title: string
  repository: string | null
  assignee: string | null
  branch: string | null
  externalUrl?: string | null
  labels?: string[] | null
  sourceUpdatedAt?: string | null
  lastSourceSyncAt?: string | null
  isDraft?: boolean | null
  headSha?: string | null
  sourceState?: SourceState | null
  sourceDetailsStatus?: SourceDetailsStatus | null
  sourceDetailsHydratedAt?: string | null
  sourceDetailsErrorCode?: string | null
  sourceDetailsErrorMessage?: string | null
  sourceClosedAt?: string | null
  sourceMergedAt?: string | null
  archiveReason?: ArchiveReason | null
  state: ItemState
  currentRound: number
  checkState: CheckState
  latestSummary: string | null
  createdAt: string
  updatedAt: string
  parentItemId?: string | null
  generatedFromDraftId?: string | null
  shortId?: string | null
  taskStatus?: TaskStatus | null
  boardSortOrder?: number | null
}

export type ItemDto = ItemSummaryDto & {
  itemId: string
  workspaceId: string
  description: string | null
  currentRunId: string | null
  lastSourceSyncAt: string | null
}

export type CommentDto = {
  commentId: string
  roundId: string | null
  authorKind: string
  authorName: string
  body: string
  visibility: string
  purpose?: CommentPurpose
  createdAt: string
  source?: string | null
  sourceCommentId?: string | null
  externalUrl?: string | null
  sourceUpdatedAt?: string | null
}

export type SourceSnapshotDto = {
  snapshotId?: string | null
  source?: string | null
  externalId?: string | null
  repository?: string | null
  headSha?: string | null
  sourceUpdatedAt?: string | null
  syncedAt?: string | null
  payloadJson?: string | null
}

export type DiscussionTurnDto = {
  discussionTurnId: string
  itemId: string
  roundId: string | null
  questionCommentId: string
  replyCommentId: string | null
  baseRunId: string
  threadId: string
  turnId: string | null
  status: DiscussionTurnStatus
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
}

export type RoundDto = {
  roundId: string
  roundNumber: number
  status: string
  summary: string | null
  createdAt: string
  completedAt: string | null
}

export type DecisionDto = {
  decisionId: string
  roundId: string
  decision: 'approve' | 'requestChanges' | 'reject' | 'reopen' | 'reReview'
  authorName: string
  commentId: string | null
  body: string | null
  createdAt: string
}

export type TimelineEventDto = {
  eventId: string
  roundId: string | null
  runId: string | null
  kind: string
  actorKind: string
  actorName: string
  title: string
  body: string | null
  metadataJson: string | null
  createdAt: string
}

export type SourceWriteDto = {
  writeId: string
  itemId: string
  roundId: string | null
  decisionId: string | null
  source: string
  kind: SourceWriteKind
  canonicalKind?: string | null
  intent: string
  status: SourceWriteStatus
  repository: string | null
  number: number | null
  headSha: string | null
  requestJson: string
  responseJson: string | null
  externalId: string | null
  externalUrl: string | null
  attemptCount: number
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type ReviewDraftCommentDto = {
  draftCommentId: string
  severity: string
  title: string
  body: string
  path: string
  line: number
  side: string
  startLine: number | null
  startSide: string | null
  suggestionReplacement: string | null
  commentOnlyReason: string | null
  status: ReviewDraftCommentStatus
  warning: string | null
  resolutionState: ReviewFindingResolutionState
  resolutionKind: ReviewFindingResolutionKind | null
  resolvedByKind: string | null
  resolutionNote: string | null
  resolvedAt: string | null
}

export type ReviewDraftDto = {
  draftId: string
  itemId: string
  roundId: string
  runId: string
  status: ReviewDraftStatus
  summaryBody: string
  majorCount: number
  minorCount: number
  suggestionCount: number
  warnings: string[]
  acceptedCount: number
  warningCount: number
  resolvedCount: number
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  sourceWriteId: string | null
  comments: ReviewDraftCommentDto[]
}

export type ImplementationDraftDto = {
  draftId: string
  itemId: string
  roundId: string
  runId: string
  status: ImplementationDraftStatus
  deliveryPolicy: DeliveryPolicy
  summary: string
  tests: string[]
  risks: string[]
  changedFiles: string[]
  proposedCommitMessage: string
  proposedPrTitle: string
  proposedPrBody: string
  branchName: string | null
  commitSha: string | null
  pullRequestItemId: string | null
  pullRequestUrl: string | null
  sourceWriteId: string | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  deliveredAt: string | null
}

export type FollowUpDraftDto = {
  draftId: string
  itemId: string
  roundId: string
  runId: string
  status: FollowUpDraftStatus
  title: string
  body: string
  rationale: string | null
  repository: string | null
  assignee: string | null
  branch: string | null
  labels: string[]
  createdItemId: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

export type RunDto = {
  runId: string
  roundId: string
  attempt: number
  status: RunStatus
  runnerKind: string
  threadId: string | null
  turnId: string | null
  appServerEndpoint: string | null
  startedAt: string | null
  completedAt: string | null
  summary: string | null
  errorCode: string | null
  errorMessage: string | null
  progressPercent: number
  statusMessage: string | null
  lastHeartbeatAt: string | null
  baseWorkspacePath: string | null
  worktreePath: string | null
  worktreeBranch: string | null
  baseRef: string | null
  baseSha: string | null
  worktreeStatus: WorktreeStatus
  worktreeErrorCode: string | null
  worktreeErrorMessage: string | null
  retryCount: number
  nextRetryAt: string | null
  leaseOwner: string | null
  leaseAcquiredAt: string | null
  worktreeCleanupAfterAt: string | null
  worktreeCleanedAt: string | null
  purpose: RunPurpose
  dispatchTrigger: RunDispatchTrigger
  targetHeadSha: string | null
  deliveryPolicy: DeliveryPolicy
  implementationTurnCount: number
}

export type ItemListResponse = {
  items: ItemSummaryDto[]
  nextCursor: string | null
}

export type TaskListResponse = {
  tasks: ItemSummaryDto[]
  nextCursor: string | null
}

export type ItemDetailResponse = {
  item: ItemDto
  rounds?: RoundDto[]
  runs: RunDto[]
  comments?: CommentDto[]
  timeline: TimelineEventDto[]
  decisions?: DecisionDto[]
  sourceWrites?: SourceWriteDto[]
  reviewDrafts?: ReviewDraftDto[]
  implementationDrafts?: ImplementationDraftDto[]
  followUpDrafts?: FollowUpDraftDto[]
  discussionTurns?: DiscussionTurnDto[]
  sourceSnapshot?: SourceSnapshotDto | null
}

export type GitHubSourceStatusResponse = {
  enabled?: boolean
  configured?: boolean
  repositories?: string[]
  lastSyncAt?: string | null
  writesEnabled?: boolean
  writeConfigured?: boolean
  message?: string | null
  capabilities?: {
    read?: boolean
    write?: boolean
    manualSync?: boolean
  }
}

export type GitHubSourceStatus = {
  available: boolean
  configured: boolean
  repositories: string[]
  lastSyncAt: string | null
  message: string
  writesEnabled: boolean
  writeConfigured: boolean
}

export type GitHubSyncStatus = 'queued' | 'running' | 'succeeded' | 'partialFailed' | 'failed'
export type GitHubSyncRepositoryStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type GitHubSyncRepositoryPhase = 'queued' | 'fetching' | 'importing' | 'done' | 'failed'
export type GitHubSyncMode = 'incremental' | 'full'
export type SourceSyncStatus = 'queued' | 'running' | 'succeeded' | 'partialFailed' | 'failed'
export type SourceSyncProjectStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type SourceSyncProjectPhase = 'queued' | 'fetching' | 'importing' | 'done' | 'failed'
export type SourceSyncMode = 'incremental' | 'full'

export type GitHubSyncRepositoryRun = {
  repositoryRunId: string
  jobId: string
  repository: string
  status: GitHubSyncRepositoryStatus
  phase: GitHubSyncRepositoryPhase
  issuesDiscovered: number
  pullRequestsDiscovered: number
  issuesImported: number
  pullRequestsImported: number
  commentsImported: number
  skipped: number
  errorCode?: string | null
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  completedAt?: string | null
}

export type GitHubSyncJob = {
  jobId: string
  trigger: 'manual' | 'webhook' | 'scheduled'
  mode: GitHubSyncMode
  status: GitHubSyncStatus
  repositoriesTotal: number
  repositoriesCompleted: number
  repositoriesFailed: number
  issuesImported: number
  pullRequestsImported: number
  commentsImported: number
  skipped: number
  errorCode?: string | null
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  completedAt?: string | null
  repositories: GitHubSyncRepositoryRun[]
}

export type SourceProviderCapability = {
  available: boolean
  state: string
  reason?: string | null
}

export type SourceProject = {
  provider: string
  instance: string
  projectPath: string
  key: string
  displayName: string
  readCapability?: SourceProviderCapability | null
  writeCapability?: SourceProviderCapability | null
  webhookCapability?: SourceProviderCapability | null
}

export type SourceProviderStatus = {
  provider: string
  displayName: string
  endpoint: string
  configured: boolean
  authenticationState: string
  readCapability: SourceProviderCapability
  writeCapability: SourceProviderCapability
  webhookCapability: SourceProviderCapability
  configuredProjectCount: number
  lastSyncAt?: string | null
  diagnostic?: string | null
  projects: SourceProject[]
}

export type SourcesResponse = {
  generatedAt: string
  providers: SourceProviderStatus[]
}

export type SourceSyncSchedule = {
  provider: string
  enabled: boolean
  intervalSeconds: number
  nextRunAt?: string | null
  lastScheduledAt?: string | null
  lastJobId?: string | null
  lastJobStatus?: SourceSyncStatus | null
  lastJobCompletedAt?: string | null
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
  readAvailable: boolean
  disabledReason?: string | null
  updatedAt: string
}

export type SourceSyncSchedulesResponse = {
  generatedAt: string
  schedules: SourceSyncSchedule[]
}

export type SourceSyncScheduleUpdateRequest = {
  enabled: boolean
  intervalSeconds?: number | null
}

export type SourceSyncProjectRun = {
  projectRunId: string
  jobId: string
  provider: string
  sourceProjectKey: string
  projectPath: string
  displayName: string
  status: SourceSyncProjectStatus
  phase: SourceSyncProjectPhase
  issuesDiscovered: number
  reviewTargetsDiscovered: number
  issuesImported: number
  reviewTargetsImported: number
  commentsImported: number
  skipped: number
  errorCode?: string | null
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  completedAt?: string | null
}

export type SourceSyncJob = {
  jobId: string
  provider: string
  trigger: 'manual' | 'webhook' | 'scheduled'
  mode: SourceSyncMode
  status: SourceSyncStatus
  projectsTotal: number
  projectsCompleted: number
  projectsFailed: number
  issuesImported: number
  reviewTargetsImported: number
  commentsImported: number
  skipped: number
  errorCode?: string | null
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  completedAt?: string | null
  projects: SourceSyncProjectRun[]
}

export type DotCraftStatusResponse = {
  configured: boolean
  connected: boolean
  health: DotCraftHealth
  autoStart: boolean
  workspacePath: string
  endpoint: string
  endpointSource?: string
  approvalPolicy: string
  runTimeoutSeconds: number
  managedWorktreesEnabled: boolean
  worktreeRootPolicy: string
  globalMaxActiveRuns: number
  maxActiveRunsPerRepository: number
  maxActiveRunsPerSource: number
  reason?: string
  message: string | null
}

export type DotCraftStatus = DotCraftStatusResponse & {
  available: boolean
}

export type DotCraftAppBindingStatusResponse = {
  appId: string
  available: boolean
  configured: boolean
  connected: boolean
  state: 'notConnected' | 'connecting' | 'connected' | 'error' | string
  workspacePath: string
  endpoint: string
  endpointSource: string
  accountLabel?: string | null
  connectedAt?: string | null
  expiresAt?: string | null
  diagnostic?: string | null
  message: string
}

export type DotCraftWorkspace = {
  path: string
  label: string
  isDefault: boolean
  repositories: string[]
  configured: boolean
  connected: boolean
  health: DotCraftHealth
  endpoint: string
  endpointSource: string
  hubManaged: boolean
  reason: string
  message: string
}

export type DotCraftWorkspacesResponse = {
  generatedAt: string
  summary: {
    total: number
    connected: number
    hubManaged: number
    defaultPath: string
  }
  workspaces: DotCraftWorkspace[]
}

export type TimelineEvent = {
  id: string
  roundId: string | null
  runId: string | null
  kind: TimelineKind
  actor: string
  title: string
  body: string
  time: string
  round: number
  suggestion?: {
    file: string
    lines: string
    replacement: string
  }
}

export type SourceComment = {
  id: string
  author: string
  body: string
  source: string
  time: string
  externalUrl: string | null
  sourceUpdatedAt: string | null
}

export type SourceWrite = {
  writeId: string
  kind: SourceWriteKind
  intent: string
  status: SourceWriteStatus
  repository: string
  number: number | null
  externalUrl: string | null
  attemptCount: number
  errorCode: string | null
  errorMessage: string | null
  updated: string
}

export type ReviewDraftComment = ReviewDraftCommentDto

export type ReviewDraft = Omit<ReviewDraftDto, 'comments'> & {
  comments: ReviewDraftComment[]
}

export type ImplementationDraft = ImplementationDraftDto

export type FollowUpDraft = FollowUpDraftDto

export type DiscussionTurn = DiscussionTurnDto

export type Run = {
  runId: string
  roundId: string
  attempt: number
  status: RunStatus
  runnerKind: string
  threadId: string | null
  turnId: string | null
  appServerEndpoint: string | null
  startedAt: string | null
  completedAt: string | null
  summary: string | null
  errorCode: string | null
  errorMessage: string | null
  progressPercent: number
  statusMessage: string | null
  lastHeartbeatAt: string | null
  baseWorkspacePath: string | null
  worktreePath: string | null
  worktreeBranch: string | null
  baseRef: string | null
  baseSha: string | null
  worktreeStatus: WorktreeStatus
  worktreeErrorCode: string | null
  worktreeErrorMessage: string | null
  retryCount: number
  nextRetryAt: string | null
  leaseOwner: string | null
  leaseAcquiredAt: string | null
  worktreeCleanupAfterAt: string | null
  worktreeCleanedAt: string | null
  purpose: RunPurpose
  dispatchTrigger: RunDispatchTrigger
  targetHeadSha: string | null
  deliveryPolicy: DeliveryPolicy
  implementationTurnCount: number
}

export type Round = {
  roundId: string
  roundNumber: number
  status: string
  summary: string | null
  createdAt: string
  completedAt: string | null
}

export type Decision = {
  decisionId: string
  roundId: string
  decision: DecisionDto['decision']
  authorName: string
  commentId: string | null
  body: string | null
  createdAt: string
}

export type RoundHistory = {
  round: Round
  runs: Run[]
  decisions: Decision[]
  comments: CommentDto[]
  events: TimelineEvent[]
}

export type ReReviewInfo = {
  previousHeadSha: string
  currentHeadSha: string
  description: string
}

export type WorkItem = {
  id: string
  itemId: string | null
  sourceKey: string
  externalId: string
  currentRunId: string | null
  type: ItemType
  kind: ItemKind
  number: string
  title: string
  description: string
  repository: string
  source: string
  state: ItemState
  shortId: string | null
  taskStatus: TaskStatus
  boardSortOrder: number
  assignee: string
  branch: string
  updated: string
  sourceUpdated: string | null
  lastSourceSync: string | null
  sourceState: SourceState
  sourceClosedAt: string | null
  sourceMergedAt: string | null
  archiveReason: ArchiveReason | null
  sourceDetailsStatus?: SourceDetailsStatus
  sourceDetailsHydratedAt?: string | null
  sourceDetailsErrorCode?: string | null
  sourceDetailsErrorMessage?: string | null
  round: number
  severity: 'low' | 'medium' | 'high'
  check: CheckState
  summary: string
  externalUrl: string | null
  labels: string[]
  isDraft: boolean
  headSha: string | null
  sourceSnapshot: SourceSnapshotDto | null
  comments: CommentDto[]
  sourceComments: SourceComment[]
  sourceWrites: SourceWrite[]
  reviewDrafts: ReviewDraft[]
  implementationDrafts: ImplementationDraft[]
  followUpDrafts: FollowUpDraft[]
  discussionTurns?: DiscussionTurn[]
  rounds: Round[]
  decisions: Decision[]
  runs: Run[]
  timeline: TimelineEvent[]
  parentItemId: string | null
  generatedFromDraftId: string | null
}

export type DragOutcomeKind =
  | 'reorder'
  | 'dispatch'
  | 'cancel-run'
  | 'approve'
  | 'request-changes'
  | 'reject'
  | 'archive'
  | 'reopen'
  | 'invalid'

export type DragOutcome = {
  kind: DragOutcomeKind
  undoMs?: number
  requiresComposer?: boolean
  message?: string
}

export type UndoToken = {
  id: string
  taskId: string
  label: string
  durationMs: number
  createdAt: number
}

export type BufferedCard = {
  taskId: string
  fromStatus: TaskStatus
  toStatus: TaskStatus
  fromIndex: number
  toIndex: number
  outcome: Exclude<DragOutcomeKind, 'reorder' | 'invalid'>
  token: UndoToken | null
}

export type BoardStreamStatus = 'connecting' | 'connected' | 'disconnected'

export type ConversationItem = {
  id: string
  turnId?: string | null
  type: string
  status: string
  payload: Record<string, unknown>
  createdAt?: string | null
  completedAt?: string | null
  streaming?: boolean
  pending?: boolean
}

export type PlanTodo = {
  id: string
  content: string
  priority: 'high' | 'medium' | 'low' | string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | string
}

export type PlanSnapshot = {
  title?: string | null
  overview?: string | null
  content?: string | null
  todos: PlanTodo[]
}

export type RunSummary = {
  runId: string
  status: string
  threadId?: string | null
  turnId?: string | null
  turnStatus?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  progressPercent?: number | null
  statusMessage?: string | null
  updatedAt?: string | null
}

export type DrawerSnapshot = {
  runId: string
  items: ConversationItem[]
  plan?: PlanSnapshot | null
  run?: RunSummary | null
  watermark?: string | null
  fromCache?: boolean
}

export type DrawerStreamEvent = {
  type: 'drawer/item.started' | 'drawer/item.delta' | 'drawer/item.completed' | 'drawer/plan/updated' | 'drawer/run/status'
  runId: string
  taskId?: string | null
  shortId?: string | null
  payload: ConversationItem | PlanSnapshot | RunSummary | Record<string, unknown>
  ts?: string
}

export type ModelInfo = {
  id: string
  displayName: string
  provider?: string | null
}

export type SubmitTurnResponse = {
  mode: 'started' | 'queued'
  turnId?: string | null
  queuedInputId?: string | null
}

export type BoardEvent = {
  type: 'task/updated' | 'task/removed' | 'ping'
  taskId?: string | null
  shortId?: string | null
  taskStatus?: TaskStatus | null
  microStatus?: 'idle' | 'running' | 'awaiting-approval' | 'error' | string | null
  boardSortOrder?: number | null
  ts?: string
}

export type SourceSyncStreamEvent =
  | { type: 'source/github-sync/job.updated'; payload: GitHubSyncJob; ts?: string }
  | { type: 'source/github-sync/repository.updated'; payload: GitHubSyncRepositoryRun; ts?: string }
  | { type: 'source/sync/job.updated'; payload: SourceSyncJob; ts?: string }
  | { type: 'source/sync/project.updated'; payload: SourceSyncProjectRun; ts?: string }
  | { type: 'source/sync/schedule.updated'; payload: SourceSyncSchedule; ts?: string }

export type BoardStreamEvent = BoardEvent | DrawerStreamEvent | SourceSyncStreamEvent

export type LocalTaskForm = {
  title: string
  description: string
  repository: string
  assignee: string
  branch: string
  labels: string
}

export type UiNotice = {
  tone: 'success' | 'error' | 'info'
  message: string
  actionLabel?: string
  onAction?: () => void
}

export type ActionIconProps = {
  active?: boolean
  children: ReactNode
  className?: string
  disabled?: boolean
  href?: string
  label: string
  onClick?: () => void
  title?: string
}

export type RepositoryFilterDropdownProps = {
  value: string
  repositories: string[]
  onChange: (value: string) => void
}

export type SectionTone = 'blue' | 'green' | 'amber' | 'slate'

export type SectionBlockProps = {
  kicker?: ReactNode
  title: ReactNode
  description?: ReactNode
  icon: ReactNode
  tone?: SectionTone
  action?: ReactNode
  children?: ReactNode
  className?: string
}

export type InfoRowGroupProps = {
  children: ReactNode
  className?: string
}

export type InfoRowProps = {
  label: ReactNode
  children: ReactNode
  multiline?: boolean
}

export type BriefFields = {
  summary: string
  keyDetails: string
  whyItMatters: string
  desiredOutcome: string
}
