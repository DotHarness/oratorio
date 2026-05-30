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
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { draftSuggestionDiffLines } from '../suggestionDiff'
import { ProductSection, ProductTextarea } from '../ui'
import type {
  BriefFields,
  DeliveryPolicy,
  FollowUpDraft,
  ReReviewInfo,
  ReviewDraft,
  ReviewDraftComment,
  ReviewFindingResolutionKind,
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
  stateLabel,
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
  resolveReviewFinding: (draftId: string, commentId: string, resolutionKind: ReviewFindingResolutionKind, note: string | null) => Promise<void>
  reopenReviewFinding: (draftId: string, commentId: string) => Promise<void>
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
          <span>{i18n.t('itemDetail:suggestion.title')}</span>
        </span>
        <span className="draft-suggestion-location">
          {comment.path}:{comment.startLine ? `${comment.startLine}-` : ''}{comment.line} · {comment.side}
        </span>
      </div>
      <div className="draft-suggestion-diff" aria-label={i18n.t('itemDetail:suggestion.diffAria')}>
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
      <span>{i18n.t('itemDetail:commentOnly.label', { reason: commentOnlyReasonLabel(reason) })}</span>
    </small>
  )
}

function commentOnlyReasonLabel(reason: string) {
  if (reason === 'needsHumanDecision') return i18n.t('itemDetail:commentOnly.needsHumanDecision')
  if (reason === 'requiresLargerChange') return i18n.t('itemDetail:commentOnly.requiresLargerChange')
  if (reason === 'cannotAnchorSafely') return i18n.t('itemDetail:commentOnly.cannotAnchorSafely')
  if (reason === 'investigateOnly') return i18n.t('itemDetail:commentOnly.investigateOnly')
  if (reason === 'leftSideOrDeletion') return i18n.t('itemDetail:commentOnly.leftSideOrDeletion')
  return reason
}

function discussionPurposeLabel(purpose?: CommentPurpose) {
  if (purpose === 'discussionQuestion') return i18n.t('itemDetail:discussionPurpose.question')
  if (purpose === 'discussionReply') return i18n.t('itemDetail:discussionPurpose.agentReply')
  if (purpose === 'systemNote') return i18n.t('itemDetail:discussionPurpose.systemNote')
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
  resolveReviewFinding,
  reopenReviewFinding,
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
  const { t } = useTranslation('itemDetail')
  const isGitLabItem = selectedItem?.sourceKey === 'gitlab'
  const reviewTargetName = isGitLabItem ? t('target.mr') : t('target.pr')
  const sourceProjectLabel = isGitLabItem ? t('sourceProject.project') : t('sourceProject.repository')
  const showSourceDetailsPanel = selectedReviewStage === 'intake' &&
    (selectedItem?.sourceKey === 'github' || selectedItem?.sourceKey === 'gitlab') &&
    (sourceDetailsSyncing || selectedItem.sourceDetailsStatus !== 'current' || selectedItem.sourceComments.length > 0)
  const sourceDetailsFailed = selectedItem?.sourceDetailsStatus === 'failed'
  const activeDiscussionTurn = selectedItem?.discussionTurns?.find((turn) => turn.status === 'pending' || turn.status === 'running') ?? null
  const latestFailedDiscussionTurn = selectedItem?.discussionTurns?.slice().reverse().find((turn) => turn.status === 'failed') ?? null
  const askAgentReason = activeDiscussionTurn
    ? activeDiscussionTurn.status === 'pending'
      ? t('askAgent.queued')
      : t('askAgent.answering')
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
          <section className="detail-pane" aria-label={t('aria.selectedItemDetail')}>
            <header className="detail-header">
              <div className="title-row">
                <h1>{selectedItem.title}</h1>
                <div className="title-actions">
                  {selectedItem.externalUrl ? (
                    <ActionIcon
                      label={t('header.openSourceTask')}
                      title={t('header.openSourceTask')}
                      href={selectedItem.externalUrl}
                    >
                      <ExternalLink size={17} />
                    </ActionIcon>
                  ) : null}
                  <div className="action-menu-wrap">
                    <ActionIcon
                      label={t('header.moreActions')}
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
                              {t('header.editLocalTask')}
                            </button>
                            {selectedItem.state === 'archived' ? (
                              <button
                                role="menuitem"
                                onClick={reopenSelectedItem}
                                disabled={!selectedCanReopen || isBusy}
                              >
                                <ArchiveRestore size={15} />
                                {t('header.reopenLocalTask')}
                              </button>
                            ) : (
                              <button
                                role="menuitem"
                                onClick={() => void archiveSelectedItem()}
                                disabled={!selectedCanArchive || isBusy}
                              >
                                <Archive size={15} />
                                {t('header.archiveLocalTask')}
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {selectedItem.externalUrl ? (
                              <a role="menuitem" href={selectedItem.externalUrl} target="_blank" rel="noreferrer">
                                <ExternalLink size={15} />
                                {t('header.openSource')}
                              </a>
                            ) : null}
                            <button role="menuitem" onClick={() => void refreshSelectedItem()} disabled={isBusy}>
                              <RefreshCw size={15} />
                              {t('header.refreshItem')}
                            </button>
                            {selectedItem.state === 'archived' ? (
                              <button role="menuitem" onClick={reopenSelectedItem} disabled={!selectedCanReopen || isBusy}>
                                <ArchiveRestore size={15} />
                                {t('header.reopenItem')}
                              </button>
                            ) : (
                              <button role="menuitem" onClick={() => void archiveSelectedItem()} disabled={!selectedCanArchive || isBusy}>
                                <Archive size={15} />
                                {t('header.archiveItem')}
                              </button>
                            )}
                          </>
                        )}
                        <button role="menuitem" onClick={() => void copySelectedItemId()}>
                          <Clipboard size={15} />
                          {t('header.copyItemId')}
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
                  {t('header.round', { round: selectedItem.round })}
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
                    {t('header.synced', { time: selectedItem.lastSourceSync })}
                  </span>
                ) : null}
                {selectedItem.isDraft ? <span className="draft-pill">{t('header.draft')}</span> : null}
                {sourceLifecycleBadge(selectedItem)}
                <Tooltip content={t('header.checkTooltip', { check: checkLabel(selectedItem.check) })}>
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
                <div className="label-row" aria-label={t('aria.sourceLabels')}>
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
                title={t('reReview.title')}
                description={reReviewInfo.description}
                action={
                  <button className="primary-button inline" onClick={reReviewPullRequest} disabled={isBusy}>
                    <RefreshCw size={16} />
                    {t('reReview.button', { target: reviewTargetName })}
                  </button>
                }
              />
            ) : null}

            {(selectedReviewStage === 'intake' || (selectedReviewStage === 'analysis' && selectedItem.state === 'failed')) && selectedCanDispatch ? (
              <SectionBlock
                className="stage-action-section dispatch-action-section"
                tone={selectedCanImplementationDispatch ? 'green' : 'blue'}
                icon={<Play size={16} />}
                title={selectedCanImplementationDispatch ? t('dispatch.startImplementation') : selectedIsPullRequest ? t('dispatch.startReview', { target: reviewTargetName }) : t('dispatch.dispatchAnalysis')}
                description={
                  selectedCanImplementationDispatch
                    ? t('dispatch.createImplementationDraft')
                    : selectedItem.state === 'failed'
                      ? t('dispatch.retryLatestRun')
                      : selectedIsPullRequest
                        ? undefined
                        : t('dispatch.readyForAnalysis')
                }
                action={
                  <div className="next-action-controls">
                    <span className="value-pill">{runnerModeLabel(runnerMode)}</span>
                    {selectedCanImplementationDispatch ? (
                      <>
                        <button className="primary-button inline" onClick={() => dispatchImplementationRound('manualDelivery')} disabled={!selectedCanImplementationDispatch}>
                          <GitBranch size={16} />
                          {t('dispatch.implement')}
                        </button>
                        <button className="secondary-button inline" onClick={() => dispatchImplementationRound('autoPr')} disabled={!selectedCanImplementationDispatch}>
                          <GitPullRequest size={16} />
                          {t('dispatch.autoTarget', { target: reviewTargetName })}
                        </button>
                        <button className="secondary-button inline" onClick={dispatchRound} disabled={!selectedCanDispatch}>
                          <Play size={16} />
                          {t('dispatch.reviewOnly')}
                        </button>
                      </>
                    ) : (
                      <button className="primary-button inline" onClick={dispatchRound} disabled={!selectedCanDispatch}>
                        <Play size={16} />
                        {selectedItem.state === 'failed' ? t('dispatch.retryRun') : selectedIsPullRequest ? t('dispatch.dispatchReview', { target: reviewTargetName }) : t('dispatch.dispatchRound')}
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
                title={t('brief.title')}
                description={selectedIsLocalTask ? t('brief.localDescription') : t('brief.sourceDescription')}
              >
                <InfoRowGroup className="brief-definition-rows">
                  {selectedBrief.summary ? (
                    <InfoRow label={t('brief.summary')} multiline>
                      <MarkdownBlock value={selectedBrief.summary} className="description-markdown" compact />
                    </InfoRow>
                  ) : null}
                  {selectedBrief.keyDetails ? (
                    <InfoRow label={t('brief.keyDetails')} multiline>
                      <MarkdownBlock value={selectedBrief.keyDetails} className="description-markdown" compact />
                    </InfoRow>
                  ) : null}
                  {selectedBrief.whyItMatters ? (
                    <InfoRow label={t('brief.whyItMatters')} multiline>
                      <MarkdownBlock value={selectedBrief.whyItMatters} className="description-markdown" compact />
                    </InfoRow>
                  ) : null}
                  {selectedBrief.desiredOutcome ? (
                    <InfoRow label={t('brief.desiredOutcome')} multiline>
                      <MarkdownBlock value={selectedBrief.desiredOutcome} className="description-markdown" compact />
                    </InfoRow>
                  ) : null}
                </InfoRowGroup>
                {!selectedBrief.keyDetails && !selectedBrief.whyItMatters && !selectedBrief.desiredOutcome ? (
                  <details className="technical-disclosure">
                    <summary>
                      <Code2 size={15} />
                      {t('brief.rawSourceBody')}
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
              title={t('source.title')}
              description={t('source.description')}
            >
              <InfoRowGroup>
                <InfoRow label={sourceProjectLabel}>{selectedItem.repository}</InfoRow>
                <InfoRow label={t('source.identifier')}>{selectedItem.number}</InfoRow>
                <InfoRow label={t('source.sourceUpdated')}>{selectedItem.sourceUpdated ?? <MissingValue />}</InfoRow>
                <InfoRow label={t('source.lastSourceSync')}>{selectedItem.lastSourceSync ?? <MissingValue />}</InfoRow>
                <InfoRow label={t('source.snapshot')}>{sourceSnapshotLabel(selectedItem.sourceSnapshot)}</InfoRow>
                <InfoRow label={t('source.headSha')}>{selectedItem.headSha ? shortSha(selectedItem.headSha) : <MissingValue />}</InfoRow>
              </InfoRowGroup>
            </SectionBlock>
            ) : null}

            {selectedReviewStage === 'intake' && selectedSourceActivity.length > 0 ? (
              <SectionBlock
                className="source-activity-section"
                tone="blue"
                icon={<Activity size={16} />}
                title={t('sourceActivity.title')}
                description={t('sourceActivity.description')}
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
                        {t('sourceActivity.showMore', { count: hiddenSourceActivity.length })}
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
                title={t('sourceComments.title')}
                description={sourceDetailsSyncing ? t('sourceComments.loadingDescription', { provider: isGitLabItem ? 'GitLab' : 'GitHub' }) : sourceDetailsFailed ? t('sourceComments.failedDescription', { provider: isGitLabItem ? 'GitLab' : 'GitHub' }) : t('sourceComments.description')}
                action={
                  sourceDetailsFailed ? (
                    <button className="secondary-button inline compact-row-action" type="button" onClick={() => void syncSelectedSourceDetails()}>
                      {t('sourceComments.retry')}
                    </button>
                  ) : (
                    <span className="count-badge">{selectedItem.sourceComments.length}</span>
                  )
                }
              >
                {sourceDetailsSyncing || (selectedItem.sourceDetailsStatus === 'stale' && selectedItem.sourceComments.length === 0) ? (
                  <div className="source-comments source-comments-loading" aria-label={t('aria.loadingSourceComments')}>
                    <span className="source-comment-skeleton" />
                    <span className="source-comment-skeleton short" />
                  </div>
                ) : sourceDetailsFailed ? (
                  <div className="source-details-error">
                    <AlertTriangle size={15} />
                    <span>{selectedItem.sourceDetailsErrorMessage || t('sourceComments.failedFallback', { provider: isGitLabItem ? 'GitLab' : 'GitHub' })}</span>
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
                            <ActionIcon className="icon-button small source-comment-link" label={t('sourceComments.openSourceComment')} href={comment.externalUrl}>
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
              title={t('agentResult.title')}
              description={t('agentResult.description')}
              action={<span className={`state-pill ${stateClassName(selectedItem.state)}`}>{stateLabel(selectedItem.state)}</span>}
            >
              <InfoRowGroup className="agent-result-facts">
                <InfoRow label={t('agentResult.agent')}>{selectedRun ? runnerKindLabel(selectedRun.runnerKind) : t('agentResult.noAgentYet')}</InfoRow>
                <InfoRow label={t('agentResult.attempt')}>{selectedRun ? selectedRun.attempt : 0}</InfoRow>
                <InfoRow label={t('agentResult.status')}>{selectedRun ? runStatusLabel(selectedRun.status) : t('agentResult.pending')}</InfoRow>
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
                  {t('agentResult.rawAgentMarkdown')}
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
                title={t('sourceWrites.title', { source: sourceLabel(selectedItem.sourceKey) })}
                description={t('sourceWrites.description')}
                action={<span className="count-badge">{selectedItem.sourceWrites.length}</span>}
              >
                <details className="audit-details section-disclosure" open={selectedItem.sourceWrites.some((write) => write.status !== 'succeeded')}>
                  <summary>
                    <span>{t('sourceWrites.writeAudit')}</span>
                  </summary>
                <div className="source-write-list">
                  {selectedItem.sourceWrites.map((write) => (
                    <article className={`source-write-card ${write.status}`} key={write.writeId}>
                      <div className="source-write-main">
                        <span className={`write-status ${write.status}`}>{sourceWriteStatusLabel(write.status)}</span>
                        <strong>{sourceWriteKindLabel(write.kind)}</strong>
                        <span>
                          {write.repository}
                          {write.number ? ` #${write.number}` : ''} · {sourceWriteIntentLabel(write.intent)} · {t('sourceWrites.attempt', { count: write.attemptCount })}
                        </span>
                      </div>
                      <div className="source-write-actions">
                        {write.externalUrl ? (
                          <ActionIcon label={t('sourceWrites.openSourceArtifact')} href={write.externalUrl}>
                            <ExternalLink size={15} />
                          </ActionIcon>
                        ) : null}
                        {write.status === 'failed' ? (
                          <button className="secondary-button inline" onClick={() => void retrySourceWrite(write.writeId)} disabled={isBusy}>
                            <RefreshCw size={15} />
                            {write.intent.startsWith('implementation') ? t('sourceWrites.retryDelivery') : t('sourceWrites.retry')}
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
                title={t('reviewDrafts.title')}
                description={t('reviewDrafts.description', { target: reviewTargetName })}
                action={<span className="count-badge">{selectedItem.reviewDrafts.length}</span>}
              >
                <details className="audit-details section-disclosure" open={selectedItem.reviewDrafts.some((draft) => draft.status === 'draft' || draft.status === 'publishFailed')}>
                  <summary>
                    <span>{t('reviewDrafts.draftDetails')}</span>
                  </summary>
                <div className="review-draft-list">
                  {selectedItem.reviewDrafts.map((draft) => {
                    const publishDisabled = isBusy || draft.status !== 'draft' || !draft.summaryBody.trim() || Boolean(reviewDraftPublishDisabledReason)
                    const commentOnlyCount = draft.comments.filter((comment) => comment.status === 'accepted' && !comment.suggestionReplacement && comment.commentOnlyReason).length
                    const publishButton = (
                      <button className="primary-button inline" onClick={() => void publishReviewDraft(draft.draftId)} disabled={publishDisabled}>
                        <Send size={15} />
                        {t('reviewDrafts.publish')}
                      </button>
                    )

                    return (
                    <article className={`review-draft-card ${draft.status}`} key={draft.draftId}>
                      <div className="review-draft-head">
                        <span className={`write-status ${draft.status === 'published' ? 'succeeded' : draft.status === 'publishFailed' ? 'failed' : 'pending'}`}>
                          {reviewDraftStatusLabel(draft.status)}
                        </span>
                        <strong>{t('reviewDrafts.headlineFindings', { major: draft.majorCount, minor: draft.minorCount, suggestions: t('reviewDrafts.codeSuggestion', { count: draft.suggestionCount }), commentOnly: t('reviewDrafts.commentOnlyFinding', { count: commentOnlyCount }) })}</strong>
                        <span>{draft.resolvedCount > 0 ? t('reviewDrafts.statsResolved', { accepted: draft.acceptedCount, warning: draft.warningCount, resolved: draft.resolvedCount }) : t('reviewDrafts.stats', { accepted: draft.acceptedCount, warning: draft.warningCount })}</span>
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
                        {draft.comments.map((comment) => {
                          const resolved = comment.resolutionState === 'resolved'
                          const canResolve = draft.status === 'published' && comment.status === 'accepted'
                          return (
                          <div className={`draft-comment ${comment.status}${resolved ? ' resolved' : ''}`} key={comment.draftCommentId}>
                            <div className="draft-comment-header">
                              <strong className="draft-comment-title">{comment.title}</strong>
                              <span className="draft-comment-location">{comment.path}:{comment.startLine ? `${comment.startLine}-` : ''}{comment.line} · {comment.side}</span>
                            </div>
                            <ReviewDraftMarkdownBlock value={comment.body} className="draft-comment-markdown" compact />
                            <DraftSuggestionPreview comment={comment} />
                            {comment.commentOnlyReason ? <CommentOnlyReasonBadge reason={comment.commentOnlyReason} /> : null}
                            {comment.warning ? <small className="draft-comment-warning">{comment.warning}</small> : null}
                            {resolved ? (
                              <div className="draft-comment-resolution">
                                <span className="resolution-chip">
                                  <CheckCircle2 size={13} />
                                  {comment.resolvedByKind
                                    ? t('reviewDrafts.resolvedWithBy', { kind: comment.resolutionKind === 'fixed' ? t('reviewDrafts.resolvedFixed') : t('reviewDrafts.resolvedDismissed'), by: comment.resolvedByKind })
                                    : t('reviewDrafts.resolved', { kind: comment.resolutionKind === 'fixed' ? t('reviewDrafts.resolvedFixed') : t('reviewDrafts.resolvedDismissed') })}
                                </span>
                                {comment.resolutionNote ? <span className="resolution-note">{comment.resolutionNote}</span> : null}
                              </div>
                            ) : null}
                            {canResolve ? (
                              <div className="draft-comment-resolution-actions">
                                {resolved ? (
                                  <button className="link-button" onClick={() => void reopenReviewFinding(draft.draftId, comment.draftCommentId)} disabled={isBusy}>
                                    {t('reviewDrafts.reopen')}
                                  </button>
                                ) : (
                                  <>
                                    <button className="link-button" onClick={() => void resolveReviewFinding(draft.draftId, comment.draftCommentId, 'fixed', null)} disabled={isBusy}>
                                      {t('reviewDrafts.markFixed')}
                                    </button>
                                    <button className="link-button" onClick={() => void resolveReviewFinding(draft.draftId, comment.draftCommentId, 'dismissed', null)} disabled={isBusy}>
                                      {t('reviewDrafts.markDismissed')}
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : null}
                          </div>
                          )
                        })}
                      </div>
                      <div className="review-draft-actions">
                        <button className="secondary-button inline" onClick={() => void editReviewDraftSummary(draft)} disabled={isBusy || draft.status !== 'draft'}>
                          <Pencil size={15} />
                          {t('reviewDrafts.edit')}
                        </button>
                        <button className="secondary-button inline" onClick={() => void discardReviewDraft(draft.draftId)} disabled={isBusy || draft.status !== 'draft'}>
                          <XCircle size={15} />
                          {t('reviewDrafts.discard')}
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
                title={t('implementationDrafts.title')}
                description={t('implementationDrafts.description')}
                action={<span className="count-badge">{selectedItem.implementationDrafts.length}</span>}
              >
                <details className="audit-details section-disclosure" open>
                  <summary>
                    <span>{t('implementationDrafts.deliveryDetails')}</span>
                  </summary>
                  <div className="review-draft-list">
                    {selectedItem.implementationDrafts.map((draft) => (
                      <article className={`review-draft-card ${draft.status}`} key={draft.draftId}>
                        <div className="review-draft-head">
                          <span className={`write-status ${draft.status === 'delivered' ? 'succeeded' : draft.status === 'deliveryFailed' ? 'failed' : 'pending'}`}>
                            {implementationDraftStatusLabel(draft.status)}
                          </span>
                          <strong>{draft.deliveryPolicy === 'autoPr' ? t('implementationDrafts.autoTarget', { target: reviewTargetName }) : deliveryPolicyLabel(draft.deliveryPolicy)}</strong>
                          <span>{t('implementationDrafts.changedFiles', { count: draft.changedFiles.length })}</span>
                        </div>
                        <MarkdownBlock value={draft.summary} className="summary-markdown compact" />
                        <InfoRowGroup>
                          <InfoRow label={t('implementationDrafts.commit')}>{draft.commitSha ?? t('implementationDrafts.notDelivered')}</InfoRow>
                          <InfoRow label={t('implementationDrafts.branch')}>{draft.branchName ?? t('implementationDrafts.pending')}</InfoRow>
                          <InfoRow label={t('implementationDrafts.generatedTarget', { target: reviewTargetName })}>
                            {draft.pullRequestUrl ? (
                              <a className="artifact-chip generated-pr-chip" href={draft.pullRequestUrl} target="_blank" rel="noreferrer">
                                <GitPullRequest size={13} />
                                {t('implementationDrafts.openTarget', { target: reviewTargetName })}
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
                            {t('implementationDrafts.deliverTarget', { target: reviewTargetName })}
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
                title={t('followUpDrafts.title')}
                description={t('followUpDrafts.description')}
                action={<span className="count-badge">{selectedItem.followUpDrafts.length}</span>}
              >
                <details className="audit-details section-disclosure" open={selectedItem.followUpDrafts.some((draft) => draft.status === 'draft')}>
                  <summary>
                    <span>{t('followUpDrafts.followUpDetails')}</span>
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
                          <InfoRow label={t('followUpDrafts.assignee')}>{draft.assignee ?? t('followUpDrafts.unassigned')}</InfoRow>
                          <InfoRow label={t('followUpDrafts.branch')}>{draft.branch ?? t('followUpDrafts.noBranch')}</InfoRow>
                          <InfoRow label={t('followUpDrafts.createdTask')}>{draft.createdItemId ?? t('followUpDrafts.notCreated')}</InfoRow>
                        </InfoRowGroup>
                        {draft.labels.length > 0 ? (
                          <div className="draft-warning-list">
                            {draft.labels.map((label) => <span key={label}><Tag size={13} />{label}</span>)}
                          </div>
                        ) : null}
                        <div className="review-draft-actions">
                          <button className="secondary-button inline" onClick={() => void editFollowUpDraft(draft)} disabled={isBusy || draft.status !== 'draft'}>
                            <Pencil size={15} />
                            {t('followUpDrafts.edit')}
                          </button>
                          <button className="secondary-button inline" onClick={() => void discardFollowUpDraft(draft.draftId)} disabled={isBusy || draft.status !== 'draft'}>
                            <XCircle size={15} />
                            {t('followUpDrafts.discard')}
                          </button>
                          <button className="primary-button inline" onClick={() => void createLocalTaskFromFollowUpDraft(draft.draftId)} disabled={isBusy || draft.status !== 'draft'}>
                            <ClipboardList size={15} />
                            {t('followUpDrafts.createTask')}
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
                title={t('discussion.title')}
                description={t('discussion.description')}
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
                      <p className="stage-empty-copy">{t('discussion.empty')}</p>
                    </div>
                  )}
                  <div className="discussion-composer">
                    <ProductTextarea
                      id="discussion-composer"
                      value={feedbackDraft}
                      onChange={(event) => setFeedbackDraft(event.target.value)}
                      placeholder={t('discussion.placeholder')}
                      rows={4}
                    />
                    <div className="command-row">
                      {askAgentReason ? <span className="discussion-action-hint">{askAgentReason}</span> : null}
                      <button className="primary-button inline" onClick={addComment} disabled={isBusy || !feedbackDraft.trim()}>
                        <Send size={16} />
                        {t('discussion.addComment')}
                      </button>
                      <Tooltip content={askAgentReason ?? t('askAgent.tooltip')}>
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
                            {t('discussion.askAgent')}
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
                title={t('decision.title')}
                description={t('decision.description')}
              >
                <ProductTextarea
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  placeholder={t('decision.placeholder')}
                  rows={4}
                />
                <div className="decision-button-row">
                  <button onClick={() => setDecision('request-changes')} disabled={!selectedCanDecide || !decisionNote.trim()} className="request-decision">
                    <MessageSquare size={16} />
                    {t('decision.requestChanges')}
                  </button>
                  <button onClick={() => setDecision('approve')} disabled={!selectedCanDecide} className="approve-decision">
                    <CheckCircle2 size={16} />
                    {t('decision.approve')}
                  </button>
                  <button onClick={() => setDecision('reject')} disabled={!selectedCanDecide} className="reject-decision">
                    <XCircle size={16} />
                    {t('decision.reject')}
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
                title={t('decisionHistory.title')}
                description={t('decisionHistory.description')}
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
                    <p className="stage-empty-copy">{t('decisionHistory.empty')}</p>
                  </div>
                )}
              </SectionBlock>
            ) : null}

            {selectedReviewStage === 'closed' ? (
              <SectionBlock
                className="brief-section closed-stage-section"
                tone="slate"
                icon={stateIcon(selectedItem.state)}
                title={stateLabel(selectedItem.state)}
                description={stateCopy(selectedItem.state)}
              >
                <InfoRowGroup>
                  <InfoRow label={t('closed.currentState')}>{stateLabel(selectedItem.state)}</InfoRow>
                  <InfoRow label={t('closed.round')}>{t('closed.roundValue', { round: selectedItem.round })}</InfoRow>
                  <InfoRow label={t('closed.latestRun')}>{selectedRun ? runStatusLabel(selectedRun.status) : t('closed.noRunRecorded')}</InfoRow>
                  <InfoRow label={t('closed.check')}>{checkLabel(selectedItem.check)}</InfoRow>
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
              title={t('latestActivity.title')}
              description={t('latestActivity.description')}
              action={
                <button className="quiet-button" onClick={toggleAllTechnicalEvents}>
                  <SlidersHorizontal size={15} />
                  {t('latestActivity.technical')}
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
                        {t('latestActivity.round', { round: group.round.roundNumber })}
                      </span>
                      <strong>{roundStatusLabel(group.round.status)}</strong>
                    </summary>
                    <div className="round-facts">
                      {latestGroupRun ? <span>{t('latestActivity.run', { status: runStatusLabel(latestGroupRun.status) })}</span> : null}
                      {latestDecision ? <span>{decisionHistoryLabel(latestDecision.decision)}</span> : null}
                      <span>{t('latestActivity.feedback', { count: group.comments.length })}</span>
                      {technicalEvents.length > 0 ? <span>{t('latestActivity.technicalCount', { count: technicalEvents.length })}</span> : null}
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
                            {t('latestActivity.rawRoundSummary')}
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
                              {t('latestActivity.attempt', { attempt: run.attempt, kind: runnerKindLabel(run.runnerKind) })}
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
                            <strong>{t('latestActivity.operatorFeedback')}</strong>
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
                          <span>{t('latestActivity.technicalEvents', { count: technicalEvents.length })}</span>
                          <button className="quiet-button" onClick={() => toggleTechnicalEvents(group.round.roundId)}>
                            {showTechnicalEvents ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            {showTechnicalEvents ? t('latestActivity.hide') : t('latestActivity.show')}
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
                                      <summary>{t('latestActivity.fullDetail')}</summary>
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
                title={t('loading.title')}
                description={t('loading.description')}
              >
                <InfoRowGroup>
                  <InfoRow label={t('loading.task')}>{selectedItem.title}</InfoRow>
                  <InfoRow label={t('loading.status')}>{t('loading.statusValue')}</InfoRow>
                </InfoRowGroup>
              </SectionBlock>
            )}
          </section>

          {reviewInspectorOpen ? (
          <aside
            className="review-pane review-drawer"
            aria-label={t('aria.reviewControls')}
          >
            <div
              className="sidecar-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label={t('aria.resizeReviewControls')}
              onPointerDown={startSidecarResize}
              onPointerMove={moveSidecarResize}
              onPointerUp={stopSidecarResize}
            />
            <header className="inspector-head">
              <span>
                <PanelRightOpen size={15} />
                {t('inspector.title')}
              </span>
              <div className="inspector-actions">
                <ActionIcon className="icon-button small" label={t('inspector.close')} onClick={() => setReviewInspectorOpen(false)}>
                  <XCircle size={15} />
                </ActionIcon>
              </div>
            </header>
            <ProductSection
              className="action-section current-state-section"
              title={stateLabel(selectedItem.state)}
              action={stateIcon(selectedItem.state)}
            >
              <p className="state-summary">{stateCopy(selectedItem.state)}</p>
              {selectedRun ? (
                <div className="run-progress">
                  <div className="run-progress-head">
                    <span>{t('inspector.attempt', { attempt: selectedRun.attempt, kind: runnerKindLabel(selectedRun.runnerKind) })}</span>
                    <strong>{runStatusLabel(selectedRun.status)}</strong>
                  </div>
                  <div className="progress-track" aria-label={t('aria.runProgress')}>
                    <span style={{ width: `${selectedRun.progressPercent}%` }} />
                  </div>
                  <p>{selectedRun.statusMessage ?? selectedRun.errorMessage ?? selectedRun.summary ?? t('inspector.waiting')}</p>
                </div>
              ) : null}
            </ProductSection>

            {selectedRun ? (
              <details className="technical-disclosure run-technical">
                <summary>
                  <Code2 size={15} />
                  {t('inspector.technicalRunDetails')}
                </summary>
                {(selectedRun.threadId || selectedRun.turnId) ? (
                  <div className="run-ids">
                    {selectedRun.threadId ? (
                      <Tooltip content={selectedRun.threadId}>
                        <span>{t('inspector.thread', { id: shortThreadId(selectedRun.threadId) })}</span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.turnId ? (
                      <Tooltip content={selectedRun.turnId}>
                        <span>{t('inspector.turn', { id: shortId(selectedRun.turnId) })}</span>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : null}
                {(selectedRun.baseWorkspacePath || selectedRun.appServerEndpoint) ? (
                  <div className="run-metadata">
                    {selectedRun.baseWorkspacePath ? (
                      <Tooltip content={selectedRun.baseWorkspacePath}>
                        <span>
                          <b>{t('inspector.workspace')}</b>
                          <em>{selectedRun.baseWorkspacePath}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.appServerEndpoint ? (
                      <Tooltip content={selectedRun.appServerEndpoint}>
                        <span>
                          <b>{t('inspector.appServer')}</b>
                          <em>{selectedRun.appServerEndpoint}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : null}
                {(selectedRun.worktreeStatus !== 'notRequired' || selectedRun.retryCount > 0) ? (
                  <div className="run-metadata">
                    <span>
                      <b>{t('inspector.worktree')}</b>
                      <em>{worktreeStatusLabel(selectedRun.worktreeStatus)}</em>
                    </span>
                    {selectedRun.worktreePath ? (
                      <Tooltip content={selectedRun.worktreePath}>
                        <span>
                          <b>{t('inspector.path')}</b>
                          <em>{selectedRun.worktreePath}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.worktreeBranch ? (
                      <Tooltip content={selectedRun.worktreeBranch}>
                        <span>
                          <b>{t('inspector.branch')}</b>
                          <em>{selectedRun.worktreeBranch}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.baseSha || selectedRun.baseRef ? (
                      <Tooltip content={selectedRun.baseSha ?? selectedRun.baseRef ?? ''}>
                        <span>
                          <b>{t('inspector.base')}</b>
                          <em>{shortId(selectedRun.baseSha ?? selectedRun.baseRef ?? '')}</em>
                        </span>
                      </Tooltip>
                    ) : null}
                    {selectedRun.retryCount > 0 || selectedRun.nextRetryAt ? (
                      <span>
                        <b>{t('inspector.retry')}</b>
                        <em>{selectedRun.nextRetryAt ? `${selectedRun.retryCount} · ${timeLabel(selectedRun.nextRetryAt)}` : selectedRun.retryCount}</em>
                      </span>
                    ) : null}
                    {selectedRun.worktreeCleanupAfterAt ? (
                      <Tooltip content={selectedRun.worktreeCleanupAfterAt}>
                        <span>
                          <b>{t('inspector.cleanup')}</b>
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
          <span>{error ?? t('aria.noReviewItems')}</span>
        </section>
      )}
    </>
  )
}
