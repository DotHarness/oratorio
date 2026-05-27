import { Check } from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ReviewStageId, Run, WorkItem } from '../../lib/types'
import { runStatusLabel, sourceLifecycleLabel, stateLabels } from '../../lib/format'

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
  const closedReached = item.state === 'approved' || item.state === 'rejected' || item.state === 'archived'
  const decisionReached = closedReached
  const analysisComplete = Boolean(run && ['succeeded', 'failed', 'cancelled', 'timedOut'].includes(run.status))
  const reviewReached = item.state === 'awaitingReview' || decisionReached
  const currentIndex = closedReached ? 4 : decisionReached ? 3 : reviewReached ? 2 : run ? 1 : 0
  const steps = [
    { id: 'intake' as const, label: 'Intake', meta: item.updated, badge: item.sourceKey === 'local' ? 'Local' : sourceLifecycleLabel(item.sourceState) },
    { id: 'analysis' as const, label: 'Analysis', meta: analysisComplete ? 'Completed' : run ? 'In progress' : 'Pending', badge: run ? runStatusLabel(run.status) : 'No run' },
    { id: 'review' as const, label: 'Review', meta: reviewReached ? 'In progress' : 'Pending', badge: item.reviewDrafts.length > 0 ? `${item.reviewDrafts.length} drafts` : item.followUpDrafts.length > 0 ? `${item.followUpDrafts.length} follow-ups` : `${item.comments.length} feedback` },
    { id: 'decision' as const, label: 'Decision', meta: decisionReached ? stateLabels[item.state] : 'Pending', badge: item.sourceWrites.length > 0 ? `${item.sourceWrites.length} writes` : decisionReached ? stateLabels[item.state] : 'Open' },
    { id: 'closed' as const, label: 'Closed', meta: closedReached ? stateLabels[item.state] : 'Pending', badge: closedReached ? stateLabels[item.state] : 'Open' },
  ]
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
    <ol className="lifecycle-stepper review-stage-nav" aria-label="Review lifecycle stages" role="tablist">
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
