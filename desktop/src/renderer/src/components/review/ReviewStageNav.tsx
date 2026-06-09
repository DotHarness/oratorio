import { Check } from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReviewStageId, Run, WorkItem } from '../../lib/types'
import { runStatusLabel, sourceLifecycleLabel, stateLabel } from '../../lib/format'

export function ReviewStageNav({
  item,
  run,
  activeStage,
  onStageChange,
}: {
  item: WorkItem
  run?: Run
  activeStage: ReviewStageId
  onStageChange: (stage: ReviewStageId) => void
}) {
  const { t } = useTranslation('review')
  const closedReached = item.state === 'approved' || item.state === 'rejected' || item.state === 'archived'
  const decisionReached = closedReached
  const diagnosticsRelevant = item.state === 'dispatching' || item.state === 'running' || item.state === 'failed' || Boolean(run && run.status !== 'succeeded')
  const showDiagnosticsStage = activeStage === 'analysis' || diagnosticsRelevant
  const reviewReached = item.state === 'awaitingReview' || decisionReached
  const currentStageId: ReviewStageId = closedReached ? 'closed' : reviewReached ? 'review' : diagnosticsRelevant ? 'analysis' : 'intake'
  const steps: Array<{ id: ReviewStageId; label: string; meta: string; badge: string }> = [
    { id: 'intake' as const, label: t('stages.intake'), meta: item.updated, badge: item.sourceKey === 'local' ? t('localBadge') : sourceLifecycleLabel(item.sourceState) },
    ...(showDiagnosticsStage
      ? [{ id: 'analysis' as const, label: t('stages.analysis'), meta: diagnosticsRelevant ? t('meta.inProgress') : t('meta.available'), badge: run ? runStatusLabel(run.status) : t('badge.diagnostics') }]
      : []),
    { id: 'review' as const, label: t('stages.review'), meta: reviewReached ? t('meta.inProgress') : t('meta.pending'), badge: item.reviewDrafts.length > 0 ? t('badge.drafts', { count: item.reviewDrafts.length }) : item.followUpDrafts.length > 0 ? t('badge.followUps', { count: item.followUpDrafts.length }) : t('badge.feedback', { count: item.comments.length }) },
    { id: 'decision' as const, label: t('stages.decision'), meta: decisionReached ? stateLabel(item.state) : t('meta.pending'), badge: item.sourceWrites.length > 0 ? t('badge.writes', { count: item.sourceWrites.length }) : decisionReached ? stateLabel(item.state) : t('badge.open') },
    { id: 'closed' as const, label: t('stages.closed'), meta: closedReached ? stateLabel(item.state) : t('meta.pending'), badge: closedReached ? stateLabel(item.state) : t('badge.open') },
  ]
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === currentStageId))
  const stageIds = steps.map((step) => step.id)

  const handleStageKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % stageIds.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + stageIds.length) % stageIds.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = stageIds.length - 1
    }

    if (nextIndex === undefined) {
      return
    }

    event.preventDefault()
    const nextStage = stageIds[nextIndex]
    onStageChange(nextStage)
    window.requestAnimationFrame(() => {
      document.getElementById(`review-stage-tab-${nextStage}`)?.focus()
    })
  }

  return (
    <ol className="lifecycle-stepper review-stage-nav" aria-label={t('ariaStages')} role="tablist">
      {steps.map((step, index) => {
        const state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'pending'
        const isActive = activeStage === step.id
        return (
          <li className={`review-stage-step ${state}${isActive ? ' active' : ''}`} key={step.id} role="presentation">
            <button
              type="button"
              className="review-stage-trigger"
              id={`review-stage-tab-${step.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`review-stage-panel-${step.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onStageChange(step.id)}
              onKeyDown={(event) => handleStageKeyDown(event, index)}
            >
              <span className="review-stage-marker-row" aria-hidden="true">
                <span className="step-node">
                  {state === 'complete' ? <Check size={12} strokeWidth={2.5} className="step-node-check" /> : null}
                  {state === 'current' ? <span className="step-node-pulse" /> : null}
                </span>
              </span>
              <span className="review-stage-copy">
                <span className="step-label-row">
                  <span className="step-label">{step.label}</span>
                  <span className="meta-badge">{step.badge}</span>
                </span>
                <span className="step-meta">{step.meta}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
