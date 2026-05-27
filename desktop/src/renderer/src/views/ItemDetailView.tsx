import { useEffect } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react'
import {
  Activity,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clipboard,
  ClipboardList,
  Clock3,
  Code2,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  MessageSquareText,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  UserRound,
  XCircle,
} from 'lucide-react'
import { draftSuggestionDiffLines } from '../suggestionDiff'
import { ProductSection, ProductTextarea } from '../ui'
import type {
  BriefFields,
  DeliveryPolicy,
  FollowUpDraft,
  ReReviewInfo,
  ReviewDraft,
  ReviewDraftComment,
  ReviewStageId,
  RoundHistory,
  Run,
  RunnerMode,
  TimelineEvent,
  WorkItem,
  CommentPurpose,
} from '../lib/types'
import {
  canDeliverImplementationDraft,
  checkIcon,
  checkLabel,
  decisionHistoryLabel,
  decisionIcon,
  deliveryPolicyLabel,
  followUpDraftStatusLabel,
  implementationDraftStatusLabel,
  isTechnicalTimelineEvent,
  reviewDraftStatusLabel,
  roundStatusLabel,
  runnerKindLabel,
  runnerModeLabel,
  runStatusLabel,
  shortId,
  shortSha,
  shortThreadId,
  sourceLabel,
  sourceLifecycleBadge,
  sourceSnapshotLabel,
  sourceWriteIntentLabel,
  sourceWriteKindLabel,
  sourceWriteStatusLabel,
  stateClassName,
  stateCopy,
  stateIcon,
  stateLabels,
  summaryPreviewLines,
  technicalPreview,
  timeLabel,
  timelineIcon,
  worktreeStatusLabel,
} from '../lib/format'
import { ActionIcon } from '../components/primitives/ActionIcon'
import { InfoRow, InfoRowGroup, MissingValue } from '../components/primitives/InfoRow'
import { MarkdownBlock } from '../components/primitives/MarkdownBlock'
import { SectionBlock } from '../components/primitives/SectionBlock'
import { Tooltip } from '../components/primitives/Tooltip'
import { ReviewStageNav } from '../components/review/ReviewStageNav'

export type ItemDetailViewProps = {
  selectedItem: WorkItem | null | undefined
  selectedRun?: Run
  selectedDetailItem: WorkItem | null
  selectedReviewStage: ReviewStageId
  selectedDetailFocus?: 'discussionComposer' | null
  selectedIsLocalTask: boolean
  selectedIsPullRequest: boolean
  selectedCanEditLocalTask: boolean
  selectedCanReopen: boolean
  selectedCanArchive: boolean
  selectedCanDispatch: boolean
  selectedCanImplementationDispatch: boolean
  selectedCanDecide: boolean
  selectedHasSourceMetadata: boolean
  selectedBrief: BriefFields
  selectedRoundHistory: RoundHistory[]
  selectedSourceActivity: TimelineEvent[]
  visibleSourceActivity: TimelineEvent[]
  hiddenSourceActivity: TimelineEvent[]
  reviewInspectorOpen: boolean
  setReviewInspectorOpen: Dispatch<SetStateAction<boolean>>
  actionMenuItemId: string | null
  setActionMenuItemId: Dispatch<SetStateAction<string | null>>
  isBusy: boolean
  sourceDetailsSyncing?: boolean
  error: string | null
  feedbackDraft: string
  setFeedbackDraft: Dispatch<SetStateAction<string>>
  decisionNote: string
  setDecisionNote: Dispatch<SetStateAction<string>>
  runnerMode: RunnerMode
  showTechnicalEventsByRound: Record<string, boolean>
  openEditLocalTask: () => void
  reopenSelectedItem: () => void
  archiveSelectedItem: () => Promise<void>
  refreshSelectedItem: () => Promise<void>
  copySelectedItemId: () => Promise<void>
  syncSelectedSourceDetails?: () => Promise<boolean>
  setSelectedReviewStage: (stage: ReviewStageId) => void
  dispatchImplementationRound: (deliveryPolicy?: DeliveryPolicy) => void
  dispatchRound: () => void
  reReviewInfo?: ReReviewInfo | null
  reReviewPullRequest: () => void
  retrySourceWrite: (writeId: string) => Promise<void>
  publishReviewDraft: (draftId: string) => Promise<void>
  reviewDraftPublishDisabledReason?: string | null
  discardReviewDraft: (draftId: string) => Promise<void>
  deliverImplementationDraft: (draftId: string) => Promise<void>
  discardFollowUpDraft: (draftId: string) => Promise<void>
  createLocalTaskFromFollowUpDraft: (draftId: string) => Promise<void>
  editFollowUpDraft: (draft: FollowUpDraft) => Promise<void>
  editReviewDraftSummary: (draft: ReviewDraft) => Promise<void>
  addComment: () => void
  askAgent?: () => void
  askAgentDisabledReason?: string | null
  setDecision: (decision: 'approve' | 'request-changes' | 'reject') => void
  toggleAllTechnicalEvents: () => void
  toggleTechnicalEvents: (roundId: string) => void
  startSidecarResize: (event: ReactPointerEvent<HTMLDivElement>) => void
  moveSidecarResize: (event: ReactPointerEvent<HTMLDivElement>) => void
  stopSidecarResize: (event: ReactPointerEvent<HTMLDivElement>) => void
}

function ReviewDraftMarkdownBlock({ value, className, compact = false }: { value: string; className?: string; compact?: boolean }) {
  return <MarkdownBlock value={value} className={className} compact={compact} />
}

function DraftSuggestionPreview({ comment }: { comment: ReviewDraftComment }) {
  const lines = comment.suggestionReplacement
    ? draftSuggestionDiffLines(comment.suggestionReplacement, comment.startLine ?? comment.line)
    : []

  if (lines.length === 0) {
    return null
  }

  return (
    <div className="draft-suggestion">
      <div className="draft-suggestion-header">
        <span className="draft-suggestion-title">
          <Code2 size={13} />
          <span>Suggested replacement</span>
        </span>
        <span className="draft-suggestion-location">
          {comment.path}:{comment.startLine ? `${comment.startLine}-` : ''}{comment.line} · {comment.side}
        </span>
      </div>
      <div className="draft-suggestion-diff" aria-label="Suggested replacement diff preview">
        {lines.map((line, index) => (
          <div className="draft-suggestion-line" key={`${line.lineNumber ?? 'line'}-${index}`}>
            <span className="draft-suggestion-marker" aria-hidden="true">{line.marker}</span>
            <span className="draft-suggestion-number" aria-hidden="true">{line.lineNumber ?? ''}</span>
            <code className="draft-suggestion-code">{line.text || ' '}</code>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommentOnlyReasonBadge({ reason }: { reason: string }) {
  return (
    <small className="draft-comment-reason">
      <MessageSquareText size={13} />
      <span>Comment-only: {commentOnlyReasonLabel(reason)}</span>
    </small>
  )
}

function commentOnlyReasonLabel(reason: string) {
  if (reason === 'needsHumanDecision') return 'Needs human decision'
  if (reason === 'requiresLargerChange') return 'Requires larger change'
  if (reason === 'cannotAnchorSafely') return 'Cannot anchor safely'
  if (reason === 'investigateOnly') return 'Investigate only'
  if (reason === 'leftSideOrDeletion') return 'Left-side or deletion'
  return reason
}

function pluralizeCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function discussionPurposeLabel(purpose?: CommentPurpose) {
  if (purpose === 'discussionQuestion') return 'Question'
  if (purpose === 'discussionReply') return 'Agent reply'
  if (purpose === 'systemNote') return 'System note'
  return null
}

export function ItemDetailView({
  selectedItem,
  selectedRun,
  selectedDetailItem,
  selectedReviewStage,
  selectedDetailFocus = null,
  selectedIsLocalTask,
  selectedIsPullRequest,
  selectedCanEditLocalTask,
  selectedCanReopen,
  selectedCanArchive,
  selectedCanDispatch,
  selectedCanImplementationDispatch,
  selectedCanDecide,
  selectedHasSourceMetadata,
  selectedBrief,
  selectedRoundHistory,
  selectedSourceActivity,
  visibleSourceActivity,
  hiddenSourceActivity,
  reviewInspectorOpen,
  setReviewInspectorOpen,
  actionMenuItemId,
  setActionMenuItemId,
  isBusy,
  sourceDetailsSyncing = false,
  error,
  feedbackDraft,
  setFeedbackDraft,
  decisionNote,
  setDecisionNote,
  runnerMode,
  showTechnicalEventsByRound,
  openEditLocalTask,
  reopenSelectedItem,
  archiveSelectedItem,
  refreshSelectedItem,
  copySelectedItemId,
  syncSelectedSourceDetails = async () => false,
  setSelectedReviewStage,
  dispatchImplementationRound,
  dispatchRound,
  reReviewInfo,
  reReviewPullRequest,
  retrySourceWrite,
  publishReviewDraft,
  reviewDraftPublishDisabledReason = null,
  discardReviewDraft,
  deliverImplementationDraft,
  discardFollowUpDraft,
  createLocalTaskFromFollowUpDraft,
  editFollowUpDraft,
  editReviewDraftSummary,
  addComment,
  askAgent = () => undefined,
  askAgentDisabledReason = null,
  setDecision,
  toggleAllTechnicalEvents,
  toggleTechnicalEvents,
  startSidecarResize,
  moveSidecarResize,
  stopSidecarResize,
}: ItemDetailViewProps) {
  const isGitLabItem = selectedItem?.sourceKey === 'gitlab'
  const reviewTargetName = isGitLabItem ? 'MR' : 'PR'
  const sourceProjectLabel = isGitLabItem ? 'Project' : 'Repository'
  const showSourceDetailsPanel = selectedReviewStage === 'intake' &&
    (selectedItem?.sourceKey === 'github' || selectedItem?.sourceKey === 'gitlab') &&
    (sourceDetailsSyncing || selectedItem.sourceDetailsStatus !== 'current' || selectedItem.sourceComments.length > 0)
  const sourceDetailsFailed = selectedItem?.sourceDetailsStatus === 'failed'
  const activeDiscussionTurn = selectedItem?.discussionTurns?.find((turn) => turn.status === 'pending' || turn.status === 'running') ?? null
  const latestFailedDiscussionTurn = selectedItem?.discussionTurns?.slice().reverse().find((turn) => turn.status === 'failed') ?? null
  const askAgentReason = activeDiscussionTurn
    ? activeDiscussionTurn.status === 'pending'
      ? 'Agent question queued.'
      : 'Agent is answering.'
    : askAgentDisabledReason ?? latestFailedDiscussionTurn?.errorMessage ?? null
  const canAskAgent = !isBusy && !askAgentDisabledReason && !activeDiscussionTurn && Boolean(feedbackDraft.trim())
  useEffect(() => {
    if (selectedReviewStage !== 'review' || selectedDetailFocus !== 'discussionComposer') {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const composer = document.getElementById('discussion-composer')
      composer?.focus()
      composer?.scrollIntoView({ block: 'center' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [selectedDetailFocus, selectedReviewStage, selectedItem?.id])

  return (
    <>
      {selectedItem ? (
        <>
          <section className="detail-pane" aria-label="Selected item detail">
            <header className="detail-header">
              <div className="title-row">
                <h1>{selectedItem.title}</h1>
                <div className="title-actions">
                  {selectedItem.externalUrl ? (
                    <ActionIcon
                      label="Open source task"
                      title="Open source task"
                      href={selectedItem.externalUrl}
                    >
                      <ExternalLink size={17} />
                    </ActionIcon>
                  ) : null}
                  <div className="action-menu-wrap">
                    <ActionIcon
                      label="More actions"
                      onClick={() => setActionMenuItemId((current) => (current === selectedItem.id ? null : selectedItem.id))}
                    >
                      <MoreHorizontal size={17} />
                    </ActionIcon>
                    {actionMenuItemId === selectedItem.id ? (
                      <div className="action-menu" role="menu">
                        {selectedIsLocalTask ? (
                          <>
                            <button role="menuitem" onClick={openEditLocalTask} disabled={!selectedCanEditLocalTask || isBusy}>
                              <Pencil size={15} />
                              Edit local task
                            </button>
                            {selectedItem.state === 'archived' ? (
                              <button
                                role="menuitem"
                                onClick={reopenSelectedItem}
                                disabled={!selectedCanReopen || isBusy}
                              >
                                <ArchiveRestore size={15} />
                                Reopen local task
                              </button>
                            ) : (
                              <button
                                role="menuitem"
                                onClick={() => void archiveSelectedItem()}
                                disabled={!selectedCanArchive || isBusy}
                              >
                                <Archive size={15} />
                                Archive local task
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {selectedItem.externalUrl ? (
                              <a role="menuitem" href={selectedItem.externalUrl} target="_blank" rel="noreferrer">
                                <ExternalLink size={15} />
                                Open source
                              </a>
                            ) : null}
                            <button role="menuitem" onClick={() => void refreshSelectedItem()} disabled={isBusy}>
                              <RefreshCw size={15} />
                              Refresh item
                            </button>
                            {selectedItem.state === 'archived' ? (
                              <button role="menuitem" onClick={reopenSelectedItem} disabled={!selectedCanReopen || isBusy}>
                                <ArchiveRestore size={15} />
                                Reopen item
                              </button>
                            ) : (
                              <button role="menuitem" onClick={() => void archiveSelectedItem()} disabled={!selectedCanArchive || isBusy}>
                                <Archive size={15} />
                                Archive item
                              </button>
                            )}
                          </>
                        )}
                        <button role="menuitem" onClick={() => void copySelectedItemId()}>
                          <Clipboard size={15} />
                          Copy item id
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="detail-meta">
                {selectedItem.branch ? (
                  <span>
                    <GitBranch size={14} />
                    {selectedItem.branch}
                  </span>
                ) : null}
                {selectedItem.assignee ? (
                  <span>
                    <UserRound size={14} />
                    {selectedItem.assignee}
                  </span>
                ) : null}
                <span>
                  <RotateCcw size={14} />
                  Round {selectedItem.round}
                </span>
                {selectedItem.headSha ? (
                  <span>
                    <GitCommit size={14} />
                    {shortSha(selectedItem.headSha)}
                  </span>
                ) : null}
                {selectedItem.lastSourceSync ? (
                  <span>
                    <RefreshCw size={14} />
                    Synced {selectedItem.lastSourceSync}
                  </span>
                ) : null}
                {selectedItem.isDraft ? <span className="draft-pill">Draft</span> : null}
                {sourceLifecycleBadge(selectedItem)}
                <Tooltip content={`oratorio/review: ${checkLabel(selectedItem.check)}`}>
                  <span className={`mini-check ${selectedItem.check}`}>
                    {checkIcon(selectedItem.check)}
                    {checkLabel(selectedItem.check)}
                  </span>
                </Tooltip>
              </div>
              <ReviewStageNav
                item={selectedItem}
                run={selectedRun}
                activeStage={selectedReviewStage}
                onStageChange={setSelectedReviewStage}
              />
              {selectedItem.labels.length > 0 ? (
                <div className="label-row" aria-label="Source labels">
                  {selectedItem.labels.map((label) => (
                    <span className="label-chip" key={label}>
                      <Tag size={12} />
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}
            </header>

            {selectedDetailItem ? (
              <>
              <div
                className={`review-stage-content review-stage-content--${selectedReviewStage}`}
                id={`review-stage-panel-${selectedReviewStage}`}
                role="tabpanel"
                aria-labelledby={`review-stage-tab-${selectedReviewStage}`}
              >
            {reReviewInfo && selectedCanDispatch ? (
              <SectionBlock
                className="stage-action-section rereview-action-section"
                tone="blue"
                icon={<GitPullRequest size={16} />}
                title="Review latest commit"
                description={reReviewInfo.description}
                action={
                  <button className="primary-button inline" onClick={reReviewPullRequest} disabled={isBusy}>
                    <RefreshCw size={16} />
                    Re-review {reviewTargetName}
                  </button>
                }
              />
            ) : null}

            {(selectedReviewStage === 'intake' || (selectedReviewStage === 'analysis' && selectedItem.state === 'failed')) && selectedCanDispatch ? (
              <SectionBlock
                className="stage-action-section dispatch-action-section"
                tone={selectedCanImplementationDispatch ? 'green' : 'blue'}
                icon={<Play size={16} />}
                title={selectedCanImplementationDispatch ? 'Start implementation' : selectedIsPullRequest ? `Start ${reviewTargetName} review` : 'Dispatch analysis'}
                description={
                  selectedCanImplementationDispatch
                    ? 'Create an implementation draft.'
                    : selectedItem.state === 'failed'
                      ? 'Retry the latest run.'
                      : selectedIsPullRequest
                        ? undefined
                        : 'Ready for analysis.'
                }
                action={
                  <div className="next-action-controls">
                    <span className="value-pill">{runnerModeLabel(runnerMode)}</span>
                    {selectedCanImplementationDispatch ? (
                      <>
                        <button className="primary-button inline" onClick={() => dispatchImplementationRound('manualDelivery')} disabled={!selectedCanImplementationDispatch}>
                          <GitBranch size={16} />
                          Implement
                        </button>
                        <button className="secondary-button inline" onClick={() => dispatchImplementationRound('autoPr')} disabled={!selectedCanImplementationDispatch}>
                          <GitPullRequest size={16} />
                          Auto {reviewTargetName}
                        </button>
                        <button className="secondary-button inline" onClick={dispatchRound} disabled={!selectedCanDispatch}>
                          <Play size={16} />
                          Review only
                        </button>
                      </>
                    ) : (
                      <button className="primary-button inline" onClick={dispatchRound} disabled={!selectedCanDispatch}>
                        <Play size={16} />
                        {selectedItem.state === 'failed' ? 'Retry run' : selectedIsPullRequest ? `Dispatch ${reviewTargetName} review` : 'Dispatch round'}
                      </button>
                    )}
                  </div>
                }
              />
            ) : null}

            {selectedReviewStage === 'intake' && selectedItem.description ? (
              <SectionBlock
                className="brief-section"
                tone="blue"
                icon={<ClipboardList size={16} />}
                title="Brief"
                description={selectedIsLocalTask ? 'Local task description.' : 'Operator-facing summary derived from the source body.'}
              >
                <InfoRowGroup className="brief-definition-rows">
                  {selectedBrief.summary ? (
                    <InfoRow label="Summary" multiline>
                      <MarkdownBlock value={selectedBrief.summary} className="description-markdown" compact />
                    </InfoRow>
                  ) : null}
                  {selectedBrief.keyDetails ? (
                    <InfoRow label="Key details" multiline>
                      <MarkdownBlock value={selectedBrief.keyDetails} className="description-markdown" compact />
                    </InfoRow>
                  ) : null}
                  {selectedBrief.whyItMatters ? (
                    <InfoRow label="Why it matters" multiline>
                      <MarkdownBlock value={selectedBrief.whyItMatters} className="description-markdown" compact />
                    </InfoRow>
                  ) : null}
                  {selectedBrief.desiredOutcome ? (
                    <InfoRow label="Desired outcome" multiline>
                      <MarkdownBlock value={selectedBrief.desiredOutcome} className="description-markdown" compact />
                    </InfoRow>
                  ) : null}
                </InfoRowGroup>
                {!selectedBrief.keyDetails && !selectedBrief.whyItMatters && !selectedBrief.desiredOutcome ? (
                  <details className="technical-disclosure">
                    <summary>
                      <Code2 size={15} />
                      Raw source body
                    </summary>
                    <MarkdownBlock value={selectedItem.description} className="event-markdown" compact />
                  </details>
                ) : null}
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'intake' && selectedHasSourceMetadata ? (
            <SectionBlock
              className="brief-section source-section"
              tone="green"
              icon={<Code2 size={16} />}
              title="Source"
              description="Compact metadata from the originating system."
            >
              <InfoRowGroup>
                <InfoRow label={sourceProjectLabel}>{selectedItem.repository}</InfoRow>
                <InfoRow label="Identifier">{selectedItem.number}</InfoRow>
                <InfoRow label="Source updated">{selectedItem.sourceUpdated ?? <MissingValue />}</InfoRow>
                <InfoRow label="Last source sync">{selectedItem.lastSourceSync ?? <MissingValue />}</InfoRow>
                <InfoRow label="Snapshot">{sourceSnapshotLabel(selectedItem.sourceSnapshot)}</InfoRow>
                <InfoRow label="Head SHA">{selectedItem.headSha ? shortSha(selectedItem.headSha) : <MissingValue />}</InfoRow>
              </InfoRowGroup>
            </SectionBlock>
            ) : null}

            {selectedReviewStage === 'intake' && selectedSourceActivity.length > 0 ? (
              <SectionBlock
                className="source-activity-section"
                tone="blue"
                icon={<Activity size={16} />}
                title="Source activity"
                description="Imported changes from the connected source."
                action={<span className="count-badge">{selectedSourceActivity.length}</span>}
              >
                <div className="source-activity-list">
                  {visibleSourceActivity.map((event) => (
                    <article className="source-activity-row" key={event.id}>
                      <span className="activity-time">{event.time}</span>
                      <div className="activity-main">
                        <strong>{event.title}</strong>
                        <MarkdownBlock value={event.body} className="activity-markdown" compact />
                      </div>
                      <span className="activity-actor">{event.actor}</span>
                    </article>
                  ))}
                  {hiddenSourceActivity.length > 0 ? (
                    <details className="source-activity-more">
                      <summary>
                        <ChevronRight size={15} />
                        Show {hiddenSourceActivity.length} more source events
                      </summary>
                      <div className="source-activity-list compact">
                        {hiddenSourceActivity.map((event) => (
                          <article className="source-activity-row" key={event.id}>
                            <span className="activity-time">{event.time}</span>
                            <div className="activity-main">
                              <strong>{event.title}</strong>
                              <MarkdownBlock value={event.body} className="activity-markdown" compact />
                            </div>
                            <span className="activity-actor">{event.actor}</span>
                          </article>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </SectionBlock>
            ) : null}

            {showSourceDetailsPanel ? (
              <SectionBlock
                className="source-comments-section"
                tone="blue"
                icon={<MessageSquareText size={16} />}
                title="Source comments"
                description={sourceDetailsSyncing ? `Loading comments and reviews from ${isGitLabItem ? 'GitLab' : 'GitHub'}.` : sourceDetailsFailed ? `${isGitLabItem ? 'GitLab' : 'GitHub'} source details could not be loaded.` : 'Comments imported from the originating system.'}
                action={
                  sourceDetailsFailed ? (
                    <button className="secondary-button inline compact-row-action" type="button" onClick={() => void syncSelectedSourceDetails()}>
                      Retry
                    </button>
                  ) : (
                    <span className="count-badge">{selectedItem.sourceComments.length}</span>
                  )
                }
              >
                {sourceDetailsSyncing || (selectedItem.sourceDetailsStatus === 'stale' && selectedItem.sourceComments.length === 0) ? (
                  <div className="source-comments source-comments-loading" aria-label="Loading source comments">
                    <span className="source-comment-skeleton" />
                    <span className="source-comment-skeleton short" />
                  </div>
                ) : sourceDetailsFailed ? (
                  <div className="source-details-error">
                    <AlertTriangle size={15} />
                    <span>{selectedItem.sourceDetailsErrorMessage || `${isGitLabItem ? 'GitLab' : 'GitHub'} source details failed to sync.`}</span>
                  </div>
                ) : (
                  <div className="source-comments">
                    {selectedItem.sourceComments.map((comment) => (
                      <article className="source-comment" key={comment.id}>
                        <div className="source-comment-head">
                          <strong>{comment.author}</strong>
                          <span>
                            {comment.source} · {comment.time}
                          </span>
                          {comment.externalUrl ? (
                            <ActionIcon className="icon-button small source-comment-link" label="Open source comment" href={comment.externalUrl}>
                              <ExternalLink size={14} />
                            </ActionIcon>
                          ) : null}
                        </div>
                        <MarkdownBlock value={comment.body} className="source-comment-markdown" compact />
                      </article>
                    ))}
                  </div>
                )}
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'analysis' ? (
            <SectionBlock
              className="brief-section agent-result-section"
              tone="amber"
              icon={<Bot size={16} />}
              title="Agent result"
              description="Latest analysis output from the runner."
              action={<span className={`state-pill ${stateClassName(selectedItem.state)}`}>{stateLabels[selectedItem.state]}</span>}
            >
              <InfoRowGroup className="agent-result-facts">
                <InfoRow label="Agent">{selectedRun ? runnerKindLabel(selectedRun.runnerKind) : 'No agent yet'}</InfoRow>
                <InfoRow label="Attempt">{selectedRun ? selectedRun.attempt : 0}</InfoRow>
                <InfoRow label="Status">{selectedRun ? runStatusLabel(selectedRun.status) : 'Pending'}</InfoRow>
              </InfoRowGroup>
              <div className="agent-brief">
                <div className="agent-brief-icon">
                  <Bot size={17} />
                </div>
                <ul className="brief-list">
                  {summaryPreviewLines(selectedItem.summary).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <details className="technical-disclosure">
                <summary>
                  <Code2 size={15} />
                  Raw agent markdown
                </summary>
                <MarkdownBlock value={selectedItem.summary} className="summary-markdown" />
              </details>
            </SectionBlock>
            ) : null}

            {selectedReviewStage === 'decision' && (selectedItem.sourceKey === 'github' || selectedItem.sourceKey === 'gitlab') && selectedItem.sourceWrites.length > 0 ? (
              <SectionBlock
                className="source-write-section"
                tone="green"
                icon={<GitCommit size={16} />}
                title={`${sourceLabel(selectedItem.sourceKey)} writes`}
                description="Auditable writes created for source feedback and review outcomes."
                action={<span className="count-badge">{selectedItem.sourceWrites.length}</span>}
              >
                <details className="audit-details section-disclosure" open={selectedItem.sourceWrites.some((write) => write.status !== 'succeeded')}>
                  <summary>
                    <span>Write audit</span>
                  </summary>
                <div className="source-write-list">
                  {selectedItem.sourceWrites.map((write) => (
                    <article className={`source-write-card ${write.status}`} key={write.writeId}>
                      <div className="source-write-main">
                        <span className={`write-status ${write.status}`}>{sourceWriteStatusLabel(write.status)}</span>
                        <strong>{sourceWriteKindLabel(write.kind)}</strong>
                        <span>
                          {write.repository}
                          {write.number ? ` #${write.number}` : ''} · {sourceWriteIntentLabel(write.intent)} · attempt {write.attemptCount}
                        </span>
                      </div>
                      <div className="source-write-actions">
                        {write.externalUrl ? (
                          <ActionIcon label="Open source artifact" href={write.externalUrl}>
                            <ExternalLink size={15} />
                          </ActionIcon>
                        ) : null}
                        {write.status === 'failed' ? (
                          <button className="secondary-button inline" onClick={() => void retrySourceWrite(write.writeId)} disabled={isBusy}>
                            <RefreshCw size={15} />
                            {write.intent.startsWith('implementation') ? 'Retry delivery' : 'Retry'}
                          </button>
                        ) : null}
                      </div>
                      {write.errorMessage ? <p>{write.errorCode ? `${write.errorCode}: ` : ''}{write.errorMessage}</p> : null}
                    </article>
                  ))}
                </div>
                </details>
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'review' && selectedItem.reviewDrafts.length > 0 ? (
              <SectionBlock
                className="review-draft-section"
                tone="amber"
                icon={<Sparkles size={16} />}
                title="Review drafts"
                description={`Structured ${reviewTargetName} review drafts awaiting operator action or audit.`}
                action={<span className="count-badge">{selectedItem.reviewDrafts.length}</span>}
              >
                <details className="audit-details section-disclosure" open={selectedItem.reviewDrafts.some((draft) => draft.status === 'draft' || draft.status === 'publishFailed')}>
                  <summary>
                    <span>Draft details</span>
                  </summary>
                <div className="review-draft-list">
                  {selectedItem.reviewDrafts.map((draft) => {
                    const publishDisabled = isBusy || draft.status !== 'draft' || !draft.summaryBody.trim() || Boolean(reviewDraftPublishDisabledReason)
                    const commentOnlyCount = draft.comments.filter((comment) => comment.status === 'accepted' && !comment.suggestionReplacement && comment.commentOnlyReason).length
                    const publishButton = (
                      <button className="primary-button inline" onClick={() => void publishReviewDraft(draft.draftId)} disabled={publishDisabled}>
                        <Send size={15} />
                        Publish
                      </button>
                    )

                    return (
                    <article className={`review-draft-card ${draft.status}`} key={draft.draftId}>
                      <div className="review-draft-head">
                        <span className={`write-status ${draft.status === 'published' ? 'succeeded' : draft.status === 'publishFailed' ? 'failed' : 'pending'}`}>
                          {reviewDraftStatusLabel(draft.status)}
                        </span>
                        <strong>{draft.majorCount} major · {draft.minorCount} minor · {pluralizeCount(draft.suggestionCount, 'code suggestion')} · {pluralizeCount(commentOnlyCount, 'comment-only finding', 'comment-only findings')}</strong>
                        <span>{draft.acceptedCount} accepted · {draft.warningCount} warning</span>
                      </div>
                      <MarkdownBlock value={draft.summaryBody} className="summary-markdown compact" />
                      {draft.warnings.length > 0 ? (
                        <div className="draft-warning-list">
                          {draft.warnings.map((warning) => (
                            <span key={warning}>
                              <AlertTriangle size={13} />
                              {warning}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="draft-comment-list">
                        {draft.comments.map((comment) => (
                          <div className={`draft-comment ${comment.status}`} key={comment.draftCommentId}>
                            <div className="draft-comment-header">
                              <strong className="draft-comment-title">{comment.title}</strong>
                              <span className="draft-comment-location">{comment.path}:{comment.startLine ? `${comment.startLine}-` : ''}{comment.line} · {comment.side}</span>
                            </div>
                            <ReviewDraftMarkdownBlock value={comment.body} className="draft-comment-markdown" compact />
                            <DraftSuggestionPreview comment={comment} />
                            {comment.commentOnlyReason ? <CommentOnlyReasonBadge reason={comment.commentOnlyReason} /> : null}
                            {comment.warning ? <small className="draft-comment-warning">{comment.warning}</small> : null}
                          </div>
                        ))}
                      </div>
                      <div className="review-draft-actions">
                        <button className="secondary-button inline" onClick={() => void editReviewDraftSummary(draft)} disabled={isBusy || draft.status !== 'draft'}>
                          <Pencil size={15} />
                          Edit
                        </button>
                        <button className="secondary-button inline" onClick={() => void discardReviewDraft(draft.draftId)} disabled={isBusy || draft.status !== 'draft'}>
                          <XCircle size={15} />
                          Discard
                        </button>
                        {reviewDraftPublishDisabledReason ? (
                          <Tooltip content={reviewDraftPublishDisabledReason}>
                            <span className="button-tooltip-trigger" tabIndex={0}>{publishButton}</span>
                          </Tooltip>
                        ) : publishButton}
                      </div>
                    </article>
                    )
                  })}
                </div>
                </details>
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'review' && selectedItem.implementationDrafts.length > 0 ? (
              <SectionBlock
                className="review-draft-section implementation-draft-section"
                tone="green"
                icon={<GitPullRequest size={16} />}
                title="Implementation drafts"
                description="Proposed implementation delivery payloads from agent runs."
                action={<span className="count-badge">{selectedItem.implementationDrafts.length}</span>}
              >
                <details className="audit-details section-disclosure" open>
                  <summary>
                    <span>Delivery details</span>
                  </summary>
                  <div className="review-draft-list">
                    {selectedItem.implementationDrafts.map((draft) => (
                      <article className={`review-draft-card ${draft.status}`} key={draft.draftId}>
                        <div className="review-draft-head">
                          <span className={`write-status ${draft.status === 'delivered' ? 'succeeded' : draft.status === 'deliveryFailed' ? 'failed' : 'pending'}`}>
                            {implementationDraftStatusLabel(draft.status)}
                          </span>
                          <strong>{draft.deliveryPolicy === 'autoPr' ? `Auto ${reviewTargetName}` : deliveryPolicyLabel(draft.deliveryPolicy)}</strong>
                          <span>{draft.changedFiles.length} changed file{draft.changedFiles.length === 1 ? '' : 's'}</span>
                        </div>
                        <MarkdownBlock value={draft.summary} className="summary-markdown compact" />
                        <InfoRowGroup>
                          <InfoRow label="Commit">{draft.commitSha ?? 'Not delivered'}</InfoRow>
                          <InfoRow label="Branch">{draft.branchName ?? 'Pending'}</InfoRow>
                          <InfoRow label={`Generated ${reviewTargetName}`}>
                            {draft.pullRequestUrl ? (
                              <a className="artifact-chip generated-pr-chip" href={draft.pullRequestUrl} target="_blank" rel="noreferrer">
                                <GitPullRequest size={13} />
                                Open {reviewTargetName}
                              </a>
                            ) : (
                              <MissingValue />
                            )}
                          </InfoRow>
                        </InfoRowGroup>
                        {draft.tests.length > 0 ? (
                          <div className="draft-warning-list">
                            {draft.tests.map((test) => <span key={test}><CheckCircle2 size={13} />{test}</span>)}
                          </div>
                        ) : null}
                        {draft.errorMessage ? <p className="action-error">{draft.errorCode ? `${draft.errorCode}: ` : ''}{draft.errorMessage}</p> : null}
                        <div className="review-draft-actions">
                          <button className="primary-button inline" onClick={() => void deliverImplementationDraft(draft.draftId)} disabled={isBusy || !canDeliverImplementationDraft(draft)}>
                            <GitPullRequest size={15} />
                            Deliver {reviewTargetName}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'review' && selectedItem.followUpDrafts.length > 0 ? (
              <SectionBlock
                className="review-draft-section follow-up-draft-section"
                tone="blue"
                icon={<ClipboardList size={16} />}
                title="Follow-up drafts"
                description="Proposed follow-up work that can become local tasks."
                action={<span className="count-badge">{selectedItem.followUpDrafts.length}</span>}
              >
                <details className="audit-details section-disclosure" open={selectedItem.followUpDrafts.some((draft) => draft.status === 'draft')}>
                  <summary>
                    <span>Follow-up details</span>
                  </summary>
                  <div className="review-draft-list">
                    {selectedItem.followUpDrafts.map((draft) => (
                      <article className={`review-draft-card ${draft.status}`} key={draft.draftId}>
                        <div className="review-draft-head">
                          <span className={`write-status ${draft.status === 'created' ? 'succeeded' : draft.status === 'discarded' ? 'failed' : 'pending'}`}>
                            {followUpDraftStatusLabel(draft.status)}
                          </span>
                          <strong>{draft.title}</strong>
                          <span>{draft.repository ?? selectedItem.repository}</span>
                        </div>
                        <MarkdownBlock value={draft.body} className="summary-markdown compact" />
                        {draft.rationale ? <p className="stage-empty-copy">{draft.rationale}</p> : null}
                        <InfoRowGroup>
                          <InfoRow label="Assignee">{draft.assignee ?? 'Unassigned'}</InfoRow>
                          <InfoRow label="Branch">{draft.branch ?? 'No branch'}</InfoRow>
                          <InfoRow label="Created task">{draft.createdItemId ?? 'Not created'}</InfoRow>
                        </InfoRowGroup>
                        {draft.labels.length > 0 ? (
                          <div className="draft-warning-list">
                            {draft.labels.map((label) => <span key={label}><Tag size={13} />{label}</span>)}
                          </div>
                        ) : null}
                        <div className="review-draft-actions">
                          <button className="secondary-button inline" onClick={() => void editFollowUpDraft(draft)} disabled={isBusy || draft.status !== 'draft'}>
                            <Pencil size={15} />
                            Edit
                          </button>
                          <button className="secondary-button inline" onClick={() => void discardFollowUpDraft(draft.draftId)} disabled={isBusy || draft.status !== 'draft'}>
                            <XCircle size={15} />
                            Discard
                          </button>
                          <button className="primary-button inline" onClick={() => void createLocalTaskFromFollowUpDraft(draft.draftId)} disabled={isBusy || draft.status !== 'draft'}>
                            <ClipboardList size={15} />
                            Create task
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'review' ? (
              <SectionBlock
                className="discussion-section"
                tone="blue"
                icon={<MessageSquare size={16} />}
                title="Discussion"
                description="Comments and next-round feedback for this review."
                action={<span className="count-badge">{selectedItem.comments.length}</span>}
              >
                <div className="discussion-thread">
                  {selectedItem.comments.length > 0 ? (
                    selectedItem.comments.map((comment) => {
                      const purposeLabel = discussionPurposeLabel(comment.purpose)
                      const isAgentComment = comment.authorKind === 'agent' || comment.purpose === 'discussionReply'
                      return (
                        <article className={`discussion-comment ${isAgentComment ? 'agent' : ''}`} key={comment.commentId}>
                          <div className="discussion-avatar" aria-hidden="true">
                            {isAgentComment ? <Bot size={15} /> : <UserRound size={15} />}
                          </div>
                          <div className="discussion-bubble">
                            <div className="discussion-comment-head">
                              <strong>{comment.authorName}</strong>
                              <span>{purposeLabel ? `${purposeLabel} · ` : ''}{timeLabel(comment.createdAt)}</span>
                            </div>
                            <MarkdownBlock value={comment.body} className="event-markdown" compact />
                          </div>
                        </article>
                      )
                    })
                  ) : (
                    <div className="stage-empty">
                      <MessageSquare size={24} strokeWidth={1.5} className="stage-empty-icon" aria-hidden="true" />
                      <p className="stage-empty-copy">No comments have been added for this Task yet.</p>
                    </div>
                  )}
                  <div className="discussion-composer">
                    <ProductTextarea
                      id="discussion-composer"
                      value={feedbackDraft}
                      onChange={(event) => setFeedbackDraft(event.target.value)}
                      placeholder="Add an internal note, next-round feedback, or an agent question"
                      rows={4}
                    />
                    <div className="command-row">
                      {askAgentReason ? <span className="discussion-action-hint">{askAgentReason}</span> : null}
                      <button className="primary-button inline" onClick={addComment} disabled={isBusy || !feedbackDraft.trim()}>
                        <Send size={16} />
                        Add comment
                      </button>
                      <Tooltip content={askAgentReason ?? 'Ask agent'}>
                        <span className="discussion-tooltip-trigger">
                          <button
                            className="secondary-button inline"
                            onClick={() => {
                              if (canAskAgent) {
                                askAgent()
                              }
                            }}
                            aria-disabled={!canAskAgent}
                          >
                            <Bot size={16} />
                            Ask agent
                          </button>
                        </span>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'decision' ? (
              <SectionBlock
                className="decision-action-section"
                tone="amber"
                icon={<ShieldCheck size={16} />}
                title="Close this review"
                description="Record the operator outcome for this item."
              >
                <ProductTextarea
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  placeholder="Optional note; required when requesting changes"
                  rows={4}
                />
                <div className="decision-button-row">
                  <button onClick={() => setDecision('request-changes')} disabled={!selectedCanDecide || !decisionNote.trim()} className="request-decision">
                    <MessageSquare size={16} />
                    Request changes
                  </button>
                  <button onClick={() => setDecision('approve')} disabled={!selectedCanDecide} className="approve-decision">
                    <CheckCircle2 size={16} />
                    Approve
                  </button>
                  <button onClick={() => setDecision('reject')} disabled={!selectedCanDecide} className="reject-decision">
                    <XCircle size={16} />
                    Reject
                  </button>
                </div>
                {error ? <p className="action-error">{error}</p> : null}
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'decision' ? (
              <SectionBlock
                className="decision-history-section"
                tone="amber"
                icon={<ShieldCheck size={16} />}
                title="Decision history"
                description="Operator decisions recorded for this Task."
                action={<span className="count-badge">{selectedItem.decisions.length}</span>}
              >
                {selectedItem.decisions.length > 0 ? (
                  <div className="feedback-event-list">
                    {selectedItem.decisions.map((decision) => (
                      <article className="timeline-event compact" key={decision.decisionId}>
                        <div className="event-icon decision">{decisionIcon(decision.decision)}</div>
                        <div className="timeline-card">
                          <div className="event-title">
                            <strong>{decisionHistoryLabel(decision.decision)}</strong>
                            <span>{decision.authorName} · {timeLabel(decision.createdAt)}</span>
                          </div>
                          {decision.body ? <MarkdownBlock value={decision.body} className="event-markdown" compact /> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="stage-empty">
                    <ShieldCheck size={24} strokeWidth={1.5} className="stage-empty-icon" aria-hidden="true" />
                    <p className="stage-empty-copy">No operator decision has been recorded yet.</p>
                  </div>
                )}
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'closed' ? (
              <SectionBlock
                className="brief-section closed-stage-section"
                tone="slate"
                icon={stateIcon(selectedItem.state)}
                title={stateLabels[selectedItem.state]}
                description={stateCopy(selectedItem.state)}
              >
                <InfoRowGroup>
                  <InfoRow label="Current state">{stateLabels[selectedItem.state]}</InfoRow>
                  <InfoRow label="Round">Round {selectedItem.round}</InfoRow>
                  <InfoRow label="Latest run">{selectedRun ? runStatusLabel(selectedRun.status) : 'No run recorded'}</InfoRow>
                  <InfoRow label="Check">{checkLabel(selectedItem.check)}</InfoRow>
                </InfoRowGroup>
                {selectedItem.summary ? (
                  <div className="agent-brief closed-summary">
                    <div className="agent-brief-icon">
                      <Bot size={17} />
                    </div>
                    <ul className="brief-list">
                      {summaryPreviewLines(selectedItem.summary).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'analysis' ? (
            <SectionBlock
              className="latest-activity-section"
              tone="slate"
              icon={<Activity size={16} />}
              title="Latest activity"
              description="Round history with source and operator events."
              action={
                <button className="quiet-button" onClick={toggleAllTechnicalEvents}>
                  <SlidersHorizontal size={15} />
                  Technical
                </button>
              }
            >
              <div className="round-history">
                {selectedRoundHistory.map((group) => {
                  const latestGroupRun = group.runs[group.runs.length - 1]
                  const latestDecision = group.decisions[group.decisions.length - 1]
                  const keyEvents = group.events.filter((event) => !isTechnicalTimelineEvent(event))
                  const technicalEvents = group.events.filter(isTechnicalTimelineEvent)
                  const showTechnicalEvents = Boolean(showTechnicalEventsByRound[group.round.roundId])

                  return (
                  <details className="round-group" key={group.round.roundId} open={group.round.roundNumber === selectedItem.round}>
                    <summary className="round-group-head">
                      <span>
                        <UserRound size={15} />
                        Round {group.round.roundNumber}
                      </span>
                      <strong>{roundStatusLabel(group.round.status)}</strong>
                    </summary>
                    <div className="round-facts">
                      {latestGroupRun ? <span>{runStatusLabel(latestGroupRun.status)} run</span> : null}
                      {latestDecision ? <span>{decisionHistoryLabel(latestDecision.decision)}</span> : null}
                      <span>{group.comments.length} feedback</span>
                      {technicalEvents.length > 0 ? <span>{technicalEvents.length} technical</span> : null}
                    </div>
                    {group.round.summary ? (
                      <div className="round-summary-preview">
                        <ul className="brief-list compact">
                          {summaryPreviewLines(group.round.summary).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        <details className="technical-disclosure">
                          <summary>
                            <Code2 size={15} />
                            Raw round summary
                          </summary>
                          <MarkdownBlock value={group.round.summary} className="event-markdown" compact />
                        </details>
                      </div>
                    ) : null}
                    {group.runs.length > 0 ? (
                      <div className="round-run-list">
                        {group.runs.map((run) => (
                          <div className="round-run" key={run.runId}>
                            <span>
                              Attempt {run.attempt} · {runnerKindLabel(run.runnerKind)}
                            </span>
                            <strong className={`status-chip ${run.status}`}>{runStatusLabel(run.status)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {group.comments.map((comment) => (
                      <article className="timeline-event compact" key={comment.commentId}>
                        <div className="event-icon comment"><MessageSquare size={15} /></div>
                        <div className="timeline-card">
                          <div className="event-title">
                            <strong>Operator feedback</strong>
                            <span>{comment.authorName} · {timeLabel(comment.createdAt)}</span>
                          </div>
                          <MarkdownBlock value={comment.body} className="event-markdown" compact />
                        </div>
                      </article>
                    ))}
                    {group.decisions.map((decision) => (
                      <article className="timeline-event compact" key={decision.decisionId}>
                        <div className="event-icon decision">{decisionIcon(decision.decision)}</div>
                        <div className="timeline-card">
                          <div className="event-title">
                            <strong>{decisionHistoryLabel(decision.decision)}</strong>
                            <span>{decision.authorName} · {timeLabel(decision.createdAt)}</span>
                          </div>
                          <MarkdownBlock value={decision.body ?? ''} className="event-markdown" compact />
                        </div>
                      </article>
                    ))}
                    {keyEvents.map((event) => (
                      <article className="timeline-event compact" key={event.id}>
                        <div className={`event-icon ${event.kind}`}>{timelineIcon(event.kind)}</div>
                        <div className="timeline-card">
                          <div className="event-title">
                            <strong>{event.title}</strong>
                            <span>
                              {event.actor} · {event.time}
                            </span>
                          </div>
                          <MarkdownBlock value={event.body} className="event-markdown" compact />
                          {event.suggestion ? (
                            <div className="suggestion-box">
                              <div className="suggestion-head">
                                <span>{event.suggestion.file}</span>
                                <span>{event.suggestion.lines}</span>
                              </div>
                              <pre>{event.suggestion.replacement}</pre>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))}
                    {technicalEvents.length > 0 ? (
                      <div className="technical-events">
                        <div className="technical-events-head">
                          <span>{technicalEvents.length} technical events</span>
                          <button className="quiet-button" onClick={() => toggleTechnicalEvents(group.round.roundId)}>
                            {showTechnicalEvents ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            {showTechnicalEvents ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {showTechnicalEvents ? (
                          <div className="technical-event-list">
                            {technicalEvents.map((event) => (
                              <article className="technical-event-row" key={event.id}>
                                <span>{event.time}</span>
                                <div>
                                  <strong>{event.title}</strong>
                                  <small>{technicalPreview(event.body)}</small>
                                  {event.body.trim() ? (
                                    <details className="technical-event-details">
                                      <summary>Full detail</summary>
                                      <MarkdownBlock value={event.body} className="event-markdown" compact />
                                    </details>
                                  ) : null}
                                </div>
                                <span>{event.actor}</span>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </details>
                  )
                })}
              </div>
            </SectionBlock>
            ) : null}

              </div>
              </>
            ) : (
              <SectionBlock
                className="brief-section"
                tone="slate"
                icon={<Clock3 size={16} />}
                title="Loading item details"
                description="Fetching the complete Task record."
              >
                <InfoRowGroup>
                  <InfoRow label="Task">{selectedItem.title}</InfoRow>
                  <InfoRow label="Status">Loading full brief and source metadata</InfoRow>
                </InfoRowGroup>
              </SectionBlock>
            )}
          </section>

          {reviewInspectorOpen ? (
          <aside
            className="review-pane review-drawer"
            aria-label="Review controls"
          >
            <div
              className="sidecar-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize review controls"
              onPointerDown={startSidecarResize}
              onPointerMove={moveSidecarResize}
              onPointerUp={stopSidecarResize}
            />
            <header className="inspector-head">
              <span>
                <PanelRightOpen size={15} />
                Review
              </span>
              <div className="inspector-actions">
                <ActionIcon className="icon-button small" label="Close inspector" onClick={() => setReviewInspectorOpen(false)}>
                  <XCircle size={15} />
                </ActionIcon>
              </div>
            </header>
            <ProductSection
              className="action-section current-state-section"
              title={stateLabels[selectedItem.state]}
              action={stateIcon(selectedItem.state)}
            >
              <p className="state-summary">{stateCopy(selectedItem.state)}</p>
              {selectedRun ? (
                <div className="run-progress">
                  <div className="run-progress-head">
                    <span>Attempt {selectedRun.attempt} · {runnerKindLabel(selectedRun.runnerKind)}</span>
                    <strong>{runStatusLabel(selectedRun.status)}</strong>
                  </div>
                  <div className="progress-track" aria-label="Run progress">
                    <span style={{ width: `${selectedRun.progressPercent}%` }} />
                  </div>
                  <p>{selectedRun.statusMessage ?? selectedRun.errorMessage ?? selectedRun.summary ?? 'Waiting for runner update.'}</p>
                </div>
              ) : null}
            </ProductSection>

            {selectedRun ? (
              <details className="technical-disclosure run-technical">
                <summary>
                  <Code2 size={15} />
                  Technical run details
                </summary>
                {(selectedRun.threadId || selectedRun.turnId) ? (
                  <div className="run-ids">
                    {selectedRun.threadId ? (
                      <Tooltip content={selectedRun.threadId}>
                        <span>thread {shortThreadId(selectedRun.threadId)}</span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.turnId ? (
                      <Tooltip content={selectedRun.turnId}>
                        <span>turn {shortId(selectedRun.turnId)}</span>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : null}
                {(selectedRun.baseWorkspacePath || selectedRun.appServerEndpoint) ? (
                  <div className="run-metadata">
                    {selectedRun.baseWorkspacePath ? (
                      <Tooltip content={selectedRun.baseWorkspacePath}>
                        <span>
                          <b>Workspace</b>
                          <em>{selectedRun.baseWorkspacePath}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.appServerEndpoint ? (
                      <Tooltip content={selectedRun.appServerEndpoint}>
                        <span>
                          <b>AppServer</b>
                          <em>{selectedRun.appServerEndpoint}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : null}
                {(selectedRun.worktreeStatus !== 'notRequired' || selectedRun.retryCount > 0) ? (
                  <div className="run-metadata">
                    <span>
                      <b>Worktree</b>
                      <em>{worktreeStatusLabel(selectedRun.worktreeStatus)}</em>
                    </span>
                    {selectedRun.worktreePath ? (
                      <Tooltip content={selectedRun.worktreePath}>
                        <span>
                          <b>Path</b>
                          <em>{selectedRun.worktreePath}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.worktreeBranch ? (
                      <Tooltip content={selectedRun.worktreeBranch}>
                        <span>
                          <b>Branch</b>
                          <em>{selectedRun.worktreeBranch}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.baseSha || selectedRun.baseRef ? (
                      <Tooltip content={selectedRun.baseSha ?? selectedRun.baseRef ?? ''}>
                        <span>
                          <b>Base</b>
                          <em>{shortId(selectedRun.baseSha ?? selectedRun.baseRef ?? '')}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.retryCount > 0 || selectedRun.nextRetryAt ? (
                      <span>
                        <b>Retry</b>
                        <em>{selectedRun.nextRetryAt ? `${selectedRun.retryCount} · ${timeLabel(selectedRun.nextRetryAt)}` : selectedRun.retryCount}</em>
                      </span>
                    ) : null}
                    {selectedRun.worktreeCleanupAfterAt ? (
                      <Tooltip content={selectedRun.worktreeCleanupAfterAt}>
                        <span>
                          <b>Cleanup</b>
                          <em>{timeLabel(selectedRun.worktreeCleanupAfterAt)}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : null}
              </details>
            ) : null}
          </aside>
          ) : null}
        </>
      ) : (
        <section className="empty-pane">
          <CircleDot size={20} />
          <span>{error ?? 'No review items available.'}</span>
        </section>
      )}
    </>
  )
}
