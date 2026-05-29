import { Activity, Bot, ClipboardList, GitBranch, GitPullRequest, MessageSquare, PanelRightOpen, Play } from 'lucide-react'
import { MarkdownBlock } from '../../components/primitives/MarkdownBlock'
import { SectionBlock } from '../../components/primitives/SectionBlock'
import { Tooltip } from '../../components/primitives/Tooltip'
import type { BriefFields, DeliveryPolicy, ReReviewInfo, ReviewStageId, Run, RunnerMode, WorkItem } from '../../lib/types'
import { runnerKindLabel, runnerModeLabel, runStatusLabel } from '../../lib/format'

const implementTooltip = 'Starts an implementation run. The agent may change the managed worktree and submits an implementation draft for manual delivery.'
const reviewOnlyTooltip = 'Starts a read-only analysis run. The agent should inspect and summarize without making implementation changes.'

type TaskStatusPanelProps = {
  item: WorkItem | null | undefined
  run?: Run
  brief: BriefFields
  runnerMode: RunnerMode
  canDispatch: boolean
  canImplementationDispatch: boolean
  isPullRequest: boolean
  reReviewInfo?: ReReviewInfo | null
  onDispatchRound: () => void
  onDispatchImplementationRound: (deliveryPolicy?: DeliveryPolicy) => void
  onReReviewPullRequest: () => void
  onOpenDetailStage: (stage: ReviewStageId, options?: { focus?: 'discussionComposer' }) => void
}

type DetailStageOptions = { focus?: 'discussionComposer' }

type ReviewNextAction = {
  label: string
  description: string
  stage: ReviewStageId
  options?: DetailStageOptions
}

function actionableReviewNextAction(item: WorkItem): ReviewNextAction | null {
  if (item.reviewDrafts.some((draft) => draft.status === 'draft' || draft.status === 'publishFailed')) {
    return {
      label: 'Review agent draft',
      description: 'Agent review output needs operator judgment.',
      stage: 'review',
    }
  }

  if (item.implementationDrafts.some((draft) => draft.status === 'draft' || draft.status === 'deliveryFailed')) {
    return {
      label: 'Review delivery draft',
      description: 'Implementation delivery needs operator review.',
      stage: 'review',
    }
  }

  if (item.followUpDrafts.some((draft) => draft.status === 'draft')) {
    return {
      label: 'Review follow-ups',
      description: 'Follow-up proposals need operator action.',
      stage: 'review',
    }
  }

  if (item.comments.length > 0) {
    return {
      label: 'View comments',
      description: 'Open the review discussion and feedback composer.',
      stage: 'review',
      options: { focus: 'discussionComposer' },
    }
  }

  if (item.state === 'awaitingReview') {
    return {
      label: 'Record decision',
      description: 'Review is ready for an operator decision.',
      stage: 'decision',
    }
  }

  return null
}

export function TaskStatusPanel({
  item,
  run,
  brief,
  runnerMode,
  canDispatch,
  canImplementationDispatch,
  isPullRequest,
  reReviewInfo,
  onDispatchRound,
  onDispatchImplementationRound,
  onReReviewPullRequest,
  onOpenDetailStage,
}: TaskStatusPanelProps) {
  if (!item) {
    return (
      <div className="task-status-panel">
        <SectionBlock tone="slate" icon={<Activity size={16} />} title="Loading task" description="Fetching the selected task." />
      </div>
    )
  }

  const summary = brief.summary || item.description || item.summary
  const hasDrafts = item.reviewDrafts.length + item.implementationDrafts.length + item.followUpDrafts.length > 0
  const reviewNextAction = actionableReviewNextAction(item)
  const canShowReReviewAction = Boolean(reReviewInfo && canDispatch && item.state !== 'archived')
  const canShowNextAction = canDispatch && item.state !== 'archived' && !reviewNextAction && !canShowReReviewAction
  const draftCount = item.reviewDrafts.length + item.implementationDrafts.length
  const artifactCount = draftCount + item.followUpDrafts.length + item.sourceWrites.length + item.comments.length
  const commentActionLabel = item.comments.length > 0 ? 'View comments' : 'Add comment'
  const isGitLab = item.sourceKey === 'gitlab'
  const reviewTargetName = isGitLab ? 'MR' : 'PR'
  const autoPrTooltip = `Starts an implementation run with Auto ${reviewTargetName} delivery. Oratorio attempts to commit, push, and create a ${isGitLab ? 'merge request' : 'pull request'} after the draft is submitted.`

  return (
    <div className="task-status-panel">
      {summary ? (
        <SectionBlock tone="blue" icon={<ClipboardList size={16} />} title="Summary" description="A compact brief for board triage.">
          <MarkdownBlock value={summary} className="task-status-brief" compact />
        </SectionBlock>
      ) : null}

      {run ? (
        <SectionBlock
          tone="blue"
          icon={<Bot size={16} />}
          title={`${runnerKindLabel(run.runnerKind)} attempt ${run.attempt}`}
          description={run.statusMessage ?? run.errorMessage ?? run.summary ?? 'Waiting for runner update.'}
          action={<span className={`status-chip ${run.status}`}>{runStatusLabel(run.status)}</span>}
        >
          <div className="run-progress task-status-run-progress">
            <div className="run-progress-head">
              <span>{runnerKindLabel(run.runnerKind)}</span>
              <strong>{runStatusLabel(run.status)}</strong>
            </div>
            <div className="progress-track" aria-label="Run progress">
              <span style={{ width: `${run.progressPercent}%` }} />
            </div>
          </div>
        </SectionBlock>
      ) : null}

      {canShowReReviewAction && reReviewInfo ? (
        <SectionBlock
          className="task-status-next-action"
          tone="blue"
          icon={<GitPullRequest size={16} />}
          title="Review latest commit"
          description={reReviewInfo.description}
        >
          <button className="primary-button" onClick={onReReviewPullRequest}>
            <GitPullRequest size={16} />
            Re-review {reviewTargetName}
          </button>
        </SectionBlock>
      ) : null}

      {canShowNextAction ? (
        <SectionBlock
          className="task-status-next-action"
          tone={canImplementationDispatch ? 'green' : 'blue'}
          icon={<Play size={16} />}
          title={canImplementationDispatch ? 'Start implementation' : item.state === 'failed' ? 'Retry run' : isPullRequest ? `Start ${reviewTargetName} review` : 'Dispatch round'}
          description={`Runner: ${runnerModeLabel(runnerMode)}`}
        >
          {canImplementationDispatch ? (
            <div className="task-status-run-actions">
              <Tooltip content={implementTooltip}>
                <button className="primary-button" onClick={() => onDispatchImplementationRound('manualDelivery')} disabled={!canImplementationDispatch}>
                  <GitBranch size={16} />
                  Implement
                </button>
              </Tooltip>
              <div className="task-status-run-actions-row">
                <Tooltip content={autoPrTooltip}>
                  <button className="secondary-button" onClick={() => onDispatchImplementationRound('autoPr')} disabled={!canImplementationDispatch}>
                    <GitPullRequest size={15} />
                    Auto {reviewTargetName}
                  </button>
                </Tooltip>
                <Tooltip content={reviewOnlyTooltip}>
                  <button className="secondary-button" onClick={onDispatchRound} disabled={!canDispatch}>
                    <Play size={15} />
                    Review only
                  </button>
                </Tooltip>
              </div>
            </div>
          ) : (
            <button className="primary-button" onClick={onDispatchRound} disabled={!canDispatch}>
              <Play size={16} />
              {item.state === 'failed' ? 'Retry run' : isPullRequest ? `Dispatch ${reviewTargetName} review` : 'Dispatch round'}
            </button>
          )}
        </SectionBlock>
      ) : null}

      {reviewNextAction ? (
        <SectionBlock
          className="task-status-next-action"
          tone={reviewNextAction.stage === 'decision' ? 'green' : 'amber'}
          icon={reviewNextAction.options?.focus === 'discussionComposer' ? <MessageSquare size={16} /> : <PanelRightOpen size={16} />}
          title={reviewNextAction.label}
          description={reviewNextAction.description}
        >
          <button className="primary-button" onClick={() => onOpenDetailStage(reviewNextAction.stage, reviewNextAction.options)}>
            <PanelRightOpen size={16} />
            {reviewNextAction.label}
          </button>
        </SectionBlock>
      ) : null}

      {artifactCount > 0 ? (
        <SectionBlock
          tone={hasDrafts ? 'amber' : 'slate'}
          icon={<Activity size={16} />}
          title="Review artifacts"
          description="Open the detail panel to review drafts, follow-ups, comments, and decisions."
        >
          <div className="task-status-counts">
          {draftCount > 0 ? (
            <button type="button" onClick={() => onOpenDetailStage('review')}>
              <strong>{draftCount}</strong>
              <span>review drafts</span>
            </button>
          ) : (
            <span>
              <strong>{draftCount}</strong>
              <span>review drafts</span>
            </span>
          )}
          {item.followUpDrafts.length > 0 ? (
            <button type="button" onClick={() => onOpenDetailStage('review')}>
              <strong>{item.followUpDrafts.length}</strong>
              <span>follow-ups</span>
            </button>
          ) : (
            <span>
              <strong>{item.followUpDrafts.length}</strong>
              <span>follow-ups</span>
            </span>
          )}
          {item.sourceWrites.length > 0 ? (
            <button type="button" onClick={() => onOpenDetailStage('decision')}>
              <strong>{item.sourceWrites.length}</strong>
              <span>writes</span>
            </button>
          ) : (
            <span>
              <strong>{item.sourceWrites.length}</strong>
              <span>writes</span>
            </span>
          )}
          {item.comments.length > 0 ? (
            <button type="button" onClick={() => onOpenDetailStage('review', { focus: 'discussionComposer' })}>
              <strong>{item.comments.length}</strong>
              <span>comments</span>
            </button>
          ) : (
            <span>
              <strong>{item.comments.length}</strong>
              <span>comments</span>
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
          className="secondary-button task-status-comment-action task-status-comment-action--solo"
          onClick={() => onOpenDetailStage('review', { focus: 'discussionComposer' })}
        >
          <MessageSquare size={15} />
          {commentActionLabel}
        </button>
      )}
    </div>
  )
}
