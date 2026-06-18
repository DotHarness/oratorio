import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, Archive, Bot, Brain, CheckCircle2, ClipboardList, GitBranch, GitPullRequest, MessageSquare, PanelRightOpen, Pencil, Play, ShieldCheck, Sparkles, Terminal, Wrench, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MarkdownBlock } from '../../components/primitives/MarkdownBlock'
import { SectionBlock } from '../../components/primitives/SectionBlock'
import { Tooltip } from '../../components/primitives/Tooltip'
import type { BriefFields, DeliveryPolicy, ReReviewInfo, ReviewStageId, Run, RunnerMode, WorkItem } from '../../lib/types'
import type { LiveActivity, LiveActivityKind } from '../../lib/liveActivity'
import { isActiveRun, runnerModeLabel, runStatusLabel, summaryPreviewLines } from '../../lib/format'

const liveActivityIcons: Record<LiveActivityKind, ReactNode> = {
  thinking: <Brain size={16} />,
  writing: <Pencil size={16} />,
  command: <Terminal size={16} />,
  tool: <Wrench size={16} />,
  working: <Bot size={16} />,
}

type TaskStatusPanelProps = {
  item: WorkItem | null | undefined
  loading?: boolean
  run?: Run
  liveActivity?: LiveActivity | null
  brief: BriefFields
  runnerMode: RunnerMode
  canDispatch: boolean
  canImplementationDispatch: boolean
  canDecide?: boolean
  canArchive?: boolean
  isPullRequest: boolean
  reReviewInfo?: ReReviewInfo | null
  onArchive?: () => void
  onDispatchRound: () => void
  onDispatchImplementationRound: (deliveryPolicy?: DeliveryPolicy) => void
  onReReviewPullRequest: () => void
  onOpenDetailStage: (stage: ReviewStageId, options?: { focus?: 'discussionComposer' }) => void
  onRecordDecision?: (decision: 'approve' | 'request-changes' | 'reject', body?: string) => void
}

type DetailStageOptions = { focus?: 'discussionComposer' }

type ReviewNextAction = {
  key: string
  stage: ReviewStageId
  options?: DetailStageOptions
}

function actionableReviewNextAction(item: WorkItem): ReviewNextAction | null {
  if (item.reviewDrafts.some((draft) => draft.status === 'draft' || draft.status === 'publishFailed')) {
    return { key: 'reviewAgentDraft', stage: 'review' }
  }

  if (item.implementationDrafts.some((draft) => draft.status === 'draft' || draft.status === 'deliveryFailed')) {
    return { key: 'reviewDeliveryDraft', stage: 'review' }
  }

  if (item.followUpDrafts.some((draft) => draft.status === 'draft')) {
    return { key: 'reviewFollowUps', stage: 'review' }
  }

  return null
}

const drawerDiagnosticRunStatuses: Run['status'][] = ['queued', 'dispatching', 'running', 'failed', 'cancelled', 'timedOut']

function shouldShowRunDiagnostics(item: WorkItem, run?: Run) {
  return Boolean(run && drawerDiagnosticRunStatuses.includes(run.status)) ||
    item.state === 'dispatching' ||
    item.state === 'running' ||
    item.state === 'failed'
}

function latestEntry<T>(items: T[]) {
  return items.length > 0 ? items[items.length - 1] : null
}

function TaskStatusSkeletonCard({ children }: { children: ReactNode }) {
  return (
    <div className="task-status-skeleton-card">
      <div className="task-status-skeleton-head">
        <span className="skeleton-block task-status-skeleton-icon" />
        <div className="task-status-skeleton-lines">
          <span className="skeleton-block task-status-skeleton-title" />
          <span className="skeleton-block task-status-skeleton-desc" />
        </div>
      </div>
      {children}
    </div>
  )
}

// Detail-fetch placeholder: flat blocks that mirror the drawer's card rhythm
// (summary · action · artifacts) until the full item detail resolves.
function TaskStatusSkeleton({ label }: { label: string }) {
  return (
    <div className="task-status-panel" role="status" aria-busy="true" aria-label={label}>
      <TaskStatusSkeletonCard>
        <div className="task-status-skeleton-body">
          <span className="skeleton-block task-status-skeleton-line" />
          <span className="skeleton-block task-status-skeleton-line task-status-skeleton-line--short" />
        </div>
      </TaskStatusSkeletonCard>
      <TaskStatusSkeletonCard>
        <div className="task-status-skeleton-body">
          <span className="skeleton-block task-status-skeleton-button task-status-skeleton-button--tall" />
          <div className="task-status-skeleton-grid">
            <span className="skeleton-block task-status-skeleton-button" />
            <span className="skeleton-block task-status-skeleton-button" />
          </div>
        </div>
      </TaskStatusSkeletonCard>
      <TaskStatusSkeletonCard>
        <div className="task-status-skeleton-grid">
          <span className="skeleton-block task-status-skeleton-tile" />
          <span className="skeleton-block task-status-skeleton-tile" />
          <span className="skeleton-block task-status-skeleton-tile" />
          <span className="skeleton-block task-status-skeleton-tile" />
        </div>
      </TaskStatusSkeletonCard>
    </div>
  )
}

export function TaskStatusPanel({
  item,
  loading = false,
  run,
  liveActivity,
  brief,
  runnerMode,
  canDispatch,
  canImplementationDispatch,
  canDecide = false,
  canArchive = false,
  isPullRequest,
  reReviewInfo,
  onArchive,
  onDispatchRound,
  onDispatchImplementationRound,
  onReReviewPullRequest,
  onOpenDetailStage,
  onRecordDecision = () => {},
}: TaskStatusPanelProps) {
  const { t } = useTranslation('detail')
  const [requestChangesOpen, setRequestChangesOpen] = useState(false)
  const [requestChangesDraft, setRequestChangesDraft] = useState('')
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  useEffect(() => {
    setRequestChangesOpen(false)
    setRequestChangesDraft('')
    setRejectConfirmOpen(false)
    setRejectNote('')
  }, [item?.id])

  if (loading) {
    return <TaskStatusSkeleton label={t('loading.title')} />
  }

  if (!item) {
    return (
      <div className="task-status-panel">
        <SectionBlock tone="slate" icon={<Activity size={16} />} title={t('loading.title')} description={t('loading.description')} />
      </div>
    )
  }

  const problemSummary = brief.summary || item.description
  const hasDrafts = item.reviewDrafts.length + item.implementationDrafts.length + item.followUpDrafts.length > 0
  const latestReviewDraft = latestEntry(item.reviewDrafts)
  const latestImplementationDraft = latestEntry(item.implementationDrafts)
  const latestFollowUpDraft = latestEntry(item.followUpDrafts)
  const latestResultSummary =
    latestReviewDraft?.summaryBody?.trim() ||
    latestImplementationDraft?.summary?.trim() ||
    latestFollowUpDraft?.body?.trim() ||
    ''
  const resultPreview = latestResultSummary ? summaryPreviewLines(latestResultSummary).slice(0, 2) : []
  const resultOutcome = resultPreview.join(' ')
  // Sentiment only applies when the headline result is a review draft; major+minor finding
  // counts are the reliable structured signal (the summary text is free-form).
  const resultSentiment = latestReviewDraft
    ? (latestReviewDraft.majorCount ?? 0) + (latestReviewDraft.minorCount ?? 0) > 0
      ? 'warn'
      : 'ok'
    : null
  const resultTone = resultSentiment === 'warn' ? 'amber' : resultSentiment === 'ok' ? 'green' : 'slate'
  const reviewNextAction = actionableReviewNextAction(item)
  const canShowReReviewAction = Boolean(reReviewInfo && canDispatch && item.state !== 'archived')
  // Closed work (approved/rejected) gets an explicit Archive action above any re-run/re-review
  // CTA, so filing it away no longer requires the overflow menu.
  const canShowArchiveAction = Boolean(canArchive && onArchive && (item.state === 'approved' || item.state === 'rejected'))
  const canShowNextAction = canDispatch && item.state !== 'archived' && item.state !== 'awaitingReview' && !reviewNextAction && !canShowReReviewAction
  const canShowDecisionAction = item.state === 'awaitingReview'
  const canShowRunStatus = Boolean(run && shouldShowRunDiagnostics(item, run))
  const liveLine = run && liveActivity && isActiveRun(run.status) ? liveActivity : null
  const runSectionClassName = `task-status-run-section${liveLine ? ' task-status-run-section--live' : ''}`
  const runStatusIcon = liveLine ? liveActivityIcons[liveLine.kind] : <Bot size={16} />
  const runStatusDescription: ReactNode = run?.errorMessage
    ? run.errorMessage
    : liveLine
      ? (
          <span className="task-status-live-line">
            {t(`run.activity.${liveLine.kind}`)}
            {liveLine.tail ? <span className="task-status-live-tail"> · {liveLine.tail}</span> : null}
          </span>
        )
      : run?.statusMessage ?? t('run.waiting')
  const draftCount = item.reviewDrafts.length + item.implementationDrafts.length
  const artifactCount = draftCount + item.followUpDrafts.length + item.sourceWrites.length + item.comments.length
  const commentActionLabel = item.comments.length > 0 ? t('commentAction.view') : t('commentAction.add')
  const isGitLab = item.sourceKey === 'gitlab'
  const reviewTargetName = isGitLab ? t('target.mr') : t('target.pr')
  const autoPrTooltip = t('autoPrTooltip', { target: reviewTargetName, longTarget: isGitLab ? t('longTarget.mr') : t('longTarget.pr') })
  const canSubmitRequestChanges = canDecide && requestChangesDraft.trim().length > 0

  return (
    <div className="task-status-panel">
      {problemSummary ? (
        <SectionBlock tone="slate" icon={<ClipboardList size={16} />} title={t('summary.title')} description={t('summary.description')}>
          <MarkdownBlock value={problemSummary} className="task-status-brief" compact />
        </SectionBlock>
      ) : null}

      {hasDrafts ? (
        <SectionBlock
          className="task-status-result-section"
          tone={resultTone}
          icon={<Sparkles size={16} />}
          title={t('result.title')}
          description={
            resultOutcome ? (
              <span className={`task-status-result-outcome${resultSentiment ? ` task-status-result-outcome--${resultSentiment}` : ''}`}>
                {resultOutcome}
              </span>
            ) : (
              t('result.description')
            )
          }
        />
      ) : null}

      {canShowRunStatus && run ? (
        <SectionBlock
          className={runSectionClassName}
          tone="slate"
          icon={runStatusIcon}
          title={t('run.agent')}
          action={
            <>
              {item.round > 1 ? (
                <span className="status-chip task-status-round-chip">{t('run.round', { round: item.round })}</span>
              ) : null}
              <span className={`status-chip ${run.status}`}>{runStatusLabel(run.status)}</span>
            </>
          }
        >
          <div className="task-status-run-feed" aria-live="polite">
            {runStatusDescription}
          </div>
        </SectionBlock>
      ) : null}

      {canShowArchiveAction ? (
        <SectionBlock
          className="task-status-next-action task-status-archive-action"
          tone="slate"
          icon={<Archive size={16} />}
          title={t('archive.title')}
          description={t('archive.description')}
        >
          <button className="secondary-button" onClick={onArchive} disabled={!canArchive}>
            <Archive size={16} />
            {t('archive.button')}
          </button>
        </SectionBlock>
      ) : null}

      {canShowReReviewAction && reReviewInfo ? (
        <SectionBlock
          className="task-status-next-action"
          tone="amber"
          icon={<GitPullRequest size={16} />}
          title={t('reReview.title')}
          description={reReviewInfo.description}
        >
          <button className="primary-button" onClick={onReReviewPullRequest}>
            <GitPullRequest size={16} />
            {t('reReview.button', { target: reviewTargetName })}
          </button>
        </SectionBlock>
      ) : null}

      {canShowNextAction ? (
        <SectionBlock
          className="task-status-next-action task-status-primary-action"
          tone={canImplementationDispatch ? 'green' : 'slate'}
          icon={<Play size={16} />}
          title={canImplementationDispatch ? t('start.implementation') : item.state === 'failed' ? t('start.retry') : isPullRequest ? t('start.review', { target: reviewTargetName }) : t('start.dispatch')}
          description={t('start.runner', { mode: runnerModeLabel(runnerMode) })}
        >
          {canImplementationDispatch ? (
            <div className="task-status-run-actions">
              <Tooltip content={t('implementTooltip')}>
                <button className="primary-button" onClick={() => onDispatchImplementationRound('manualDelivery')} disabled={!canImplementationDispatch}>
                  <GitBranch size={16} />
                  {t('start.implement')}
                </button>
              </Tooltip>
              <div className="task-status-run-actions-row">
                <Tooltip content={autoPrTooltip}>
                  <button className="secondary-button" onClick={() => onDispatchImplementationRound('autoPr')} disabled={!canImplementationDispatch}>
                    <GitPullRequest size={15} />
                    {t('start.autoTarget', { target: reviewTargetName })}
                  </button>
                </Tooltip>
                <Tooltip content={t('reviewOnlyTooltip')}>
                  <button className="secondary-button" onClick={onDispatchRound} disabled={!canDispatch}>
                    <Play size={15} />
                    {t('start.reviewOnly')}
                  </button>
                </Tooltip>
              </div>
            </div>
          ) : (
            <button className="primary-button" onClick={onDispatchRound} disabled={!canDispatch}>
              <Play size={16} />
              {item.state === 'failed' ? t('start.retry') : isPullRequest ? t('start.dispatchReview', { target: reviewTargetName }) : t('start.dispatch')}
            </button>
          )}
        </SectionBlock>
      ) : null}

      {reviewNextAction ? (
        <SectionBlock
          className={`task-status-next-action${canShowDecisionAction ? '' : ' task-status-primary-action'}`}
          tone={reviewNextAction.stage === 'decision' ? 'green' : 'amber'}
          icon={reviewNextAction.options?.focus === 'discussionComposer' ? <MessageSquare size={16} /> : <PanelRightOpen size={16} />}
          title={t(`nextAction.${reviewNextAction.key}.label`)}
          description={t(`nextAction.${reviewNextAction.key}.description`)}
        >
          <button className="primary-button" onClick={() => onOpenDetailStage(reviewNextAction.stage, reviewNextAction.options)}>
            <PanelRightOpen size={16} />
            {t(`nextAction.${reviewNextAction.key}.label`)}
          </button>
        </SectionBlock>
      ) : null}

      {canShowDecisionAction ? (
        <SectionBlock
          className="task-status-next-action task-status-primary-action task-status-decision-action"
          tone="amber"
          icon={<ShieldCheck size={16} />}
          title={t('drawerDecision.title')}
          description={t('drawerDecision.description')}
        >
          <div className="task-status-decision-stack">
            <button className="primary-button" onClick={() => onRecordDecision('approve')} disabled={!canDecide}>
              <CheckCircle2 size={16} />
              {t('drawerDecision.approve')}
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setRequestChangesOpen((current) => !current)
                setRejectConfirmOpen(false)
              }}
              disabled={!canDecide}
              aria-expanded={requestChangesOpen}
            >
              <MessageSquare size={16} />
              {t('drawerDecision.requestChanges')}
            </button>
          </div>

          {requestChangesOpen ? (
            <form
              className="task-status-decision-form"
              aria-label={t('drawerDecision.requestChangesAria')}
              onSubmit={(event) => {
                event.preventDefault()
                if (!canSubmitRequestChanges) {
                  return
                }

                onRecordDecision('request-changes', requestChangesDraft)
                setRequestChangesDraft('')
                setRequestChangesOpen(false)
              }}
            >
              <textarea
                value={requestChangesDraft}
                onChange={(event) => setRequestChangesDraft(event.target.value)}
                rows={4}
                placeholder={t('drawerDecision.requestChangesPlaceholder')}
              />
              <div className="task-status-inline-actions">
                <button
                  type="button"
                  className="secondary-button inline"
                  onClick={() => {
                    setRequestChangesDraft('')
                    setRequestChangesOpen(false)
                  }}
                >
                  {t('drawerDecision.requestChangesCancel')}
                </button>
                <button type="submit" className="primary-button inline" disabled={!canSubmitRequestChanges}>
                  {t('drawerDecision.requestChangesSubmit')}
                </button>
              </div>
            </form>
          ) : null}

          <div className="task-status-danger-zone">
            <button
              className="danger-button task-status-reject-trigger"
              onClick={() => {
                setRejectConfirmOpen(true)
                setRequestChangesOpen(false)
              }}
              disabled={!canDecide}
            >
              <XCircle size={16} />
              {t('drawerDecision.reject')}
            </button>

            {rejectConfirmOpen ? (
              <form
                className="task-status-reject-confirm"
                role="alertdialog"
                aria-label={t('drawerDecision.rejectAria')}
                onSubmit={(event) => {
                  event.preventDefault()
                  onRecordDecision('reject', rejectNote)
                  setRejectNote('')
                  setRejectConfirmOpen(false)
                }}
              >
                <div>
                  <strong>{t('drawerDecision.rejectTitle')}</strong>
                  <p>{t('drawerDecision.rejectDescription')}</p>
                </div>
                <label>
                  <span>{t('drawerDecision.rejectNote')}</span>
                  <textarea
                    value={rejectNote}
                    onChange={(event) => setRejectNote(event.target.value)}
                    rows={3}
                    placeholder={t('drawerDecision.rejectNotePlaceholder')}
                    disabled={!canDecide}
                  />
                </label>
                <div className="task-status-inline-actions">
                  <button
                    type="button"
                    className="secondary-button inline"
                    onClick={() => {
                      setRejectNote('')
                      setRejectConfirmOpen(false)
                    }}
                  >
                    {t('drawerDecision.rejectCancel')}
                  </button>
                  <button type="submit" className="danger-button inline" disabled={!canDecide}>
                    {t('drawerDecision.rejectConfirm')}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </SectionBlock>
      ) : null}

      {artifactCount > 0 ? (
        <SectionBlock
          tone={hasDrafts ? 'amber' : 'slate'}
          icon={<Activity size={16} />}
          title={t('artifacts.title')}
          description={t('artifacts.description')}
        >
          <div className="task-status-counts">
          {draftCount > 0 ? (
            <button type="button" onClick={() => onOpenDetailStage('review')}>
              <strong>{draftCount}</strong>
              <span>{t('artifacts.reviewDrafts')}</span>
            </button>
          ) : (
            <span>
              <strong>{draftCount}</strong>
              <span>{t('artifacts.reviewDrafts')}</span>
            </span>
          )}
          {item.followUpDrafts.length > 0 ? (
            <button type="button" onClick={() => onOpenDetailStage('review')}>
              <strong>{item.followUpDrafts.length}</strong>
              <span>{t('artifacts.followUps')}</span>
            </button>
          ) : (
            <span>
              <strong>{item.followUpDrafts.length}</strong>
              <span>{t('artifacts.followUps')}</span>
            </span>
          )}
          {item.sourceWrites.length > 0 ? (
            <button type="button" onClick={() => onOpenDetailStage('decision')}>
              <strong>{item.sourceWrites.length}</strong>
              <span>{t('artifacts.writes')}</span>
            </button>
          ) : (
            <span>
              <strong>{item.sourceWrites.length}</strong>
              <span>{t('artifacts.writes')}</span>
            </span>
          )}
          {item.comments.length > 0 ? (
            <button type="button" onClick={() => onOpenDetailStage('review', { focus: 'discussionComposer' })}>
              <strong>{item.comments.length}</strong>
              <span>{t('artifacts.comments')}</span>
            </button>
          ) : (
            <span>
              <strong>{item.comments.length}</strong>
              <span>{t('artifacts.comments')}</span>
            </span>
          )}
          </div>
          <button className="secondary-button task-status-comment-action" onClick={() => onOpenDetailStage('review', { focus: 'discussionComposer' })}>
            <MessageSquare size={15} />
            {commentActionLabel}
          </button>
        </SectionBlock>
      ) : (
        <button
          className="secondary-button task-status-comment-action"
          onClick={() => onOpenDetailStage('review', { focus: 'discussionComposer' })}
        >
          <MessageSquare size={15} />
          {commentActionLabel}
        </button>
      )}
    </div>
  )
}
