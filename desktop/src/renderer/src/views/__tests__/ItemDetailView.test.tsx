import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemDetailView } from '../ItemDetailView'
import type { WorkItem } from '../../lib/types'

const item: WorkItem = {
  id: 'local:task-1',
  itemId: 'task-1',
  sourceKey: 'local',
  externalId: 'task-1',
  currentRunId: null,
  type: 'task',
  kind: 'localTask',
  number: 'task-1',
  title: 'Stabilize review workflow',
  description: '## Summary\nKeep the current review detail stable while splitting modules.',
  repository: 'oratorio',
  source: 'Local',
  state: 'discovered',
  shortId: 'DEF-1',
  taskStatus: 'todo',
  boardSortOrder: 0,
  assignee: 'unassigned',
  branch: 'main',
  updated: 'just now',
  sourceUpdated: null,
  lastSourceSync: null,
  sourceState: 'unknown',
  sourceClosedAt: null,
  sourceMergedAt: null,
  archiveReason: null,
  round: 1,
  severity: 'medium',
  check: 'notConfigured',
  summary: 'No agent summary is available yet.',
  externalUrl: null,
  labels: ['frontend'],
  isDraft: false,
  headSha: null,
  sourceSnapshot: null,
  comments: [],
  sourceComments: [],
  sourceWrites: [],
  reviewDrafts: [],
  implementationDrafts: [],
  followUpDrafts: [],
  rounds: [],
  decisions: [],
  runs: [],
  timeline: [],
  parentItemId: null,
  generatedFromDraftId: null,
}

const asyncAction = vi.fn(async () => undefined)
const syncAction = vi.fn()

describe('ItemDetailView', () => {
  afterEach(cleanup)

  it('renders the current detail surface for a selected item', () => {
    renderDetail()

    expect(screen.getByRole('heading', { name: 'Stabilize review workflow' })).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Intake/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Brief' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open review drawer' })).not.toBeInTheDocument()
  })

  it('shows GitHub source detail loading and retry states', () => {
    const githubItem = {
      ...item,
      sourceKey: 'github',
      source: 'GitHub',
      kind: 'pullRequest' as const,
      type: 'pr' as const,
      externalId: 'pr:example-owner/oratorio#184',
      sourceDetailsStatus: 'stale' as const,
    }
    const retry = vi.fn(async () => true)

    const { rerender } = renderDetail({
      selectedItem: githubItem,
      selectedDetailItem: githubItem,
      selectedIsLocalTask: false,
      selectedIsPullRequest: true,
      sourceDetailsSyncing: true,
      syncSelectedSourceDetails: retry,
    })

    expect(screen.getByLabelText('Loading source comments')).toBeInTheDocument()

    rerender(renderDetailElement({
      selectedItem: { ...githubItem, sourceDetailsStatus: 'failed', sourceDetailsErrorMessage: 'GitHub timed out.' },
      selectedDetailItem: { ...githubItem, sourceDetailsStatus: 'failed', sourceDetailsErrorMessage: 'GitHub timed out.' },
      selectedIsLocalTask: false,
      selectedIsPullRequest: true,
      sourceDetailsSyncing: false,
      syncSelectedSourceDetails: retry,
    }))
    expect(screen.getByText('GitHub timed out.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('uses the app tooltip for Ask agent and omits the review drawer opener', async () => {
    renderDetail({
      selectedReviewStage: 'review',
      askAgentDisabledReason: 'Ask agent is available after a completed DotCraft run.',
    })

    expect(screen.queryByRole('button', { name: 'Open review drawer' })).not.toBeInTheDocument()
    const askAgent = screen.getByRole('button', { name: 'Ask agent' })
    expect(askAgent).not.toHaveAttribute('title')
    expect(askAgent).not.toBeDisabled()
    expect(askAgent).toHaveAttribute('aria-disabled', 'true')

    const trigger = askAgent.closest('.discussion-tooltip-trigger')
    expect(trigger).not.toBeNull()
    fireEvent.pointerEnter(trigger as HTMLElement)

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Ask agent is available after a completed DotCraft run.')
    })
  })

  it('disables review draft publish when GitHub writes are disabled', async () => {
    const publishReviewDraft = vi.fn(async () => undefined)
    const reason = 'GitHub writes are disabled. Enable GitHub writes in Settings before publishing review drafts.'
    const reviewItem: WorkItem = {
      ...item,
      sourceKey: 'github',
      source: 'GitHub',
      kind: 'pullRequest',
      type: 'pr',
      state: 'awaitingReview',
      taskStatus: 'in_review',
      reviewDrafts: [
        {
          draftId: 'draft-1',
          itemId: 'task-1',
          roundId: 'round-1',
          runId: 'run-1',
          status: 'draft',
          summaryBody: 'Ready to publish.',
          majorCount: 0,
          minorCount: 0,
          suggestionCount: 1,
          warnings: [],
          acceptedCount: 2,
          warningCount: 0,
          resolvedCount: 0,
          createdAt: '2026-05-10T00:00:00Z',
          updatedAt: '2026-05-10T00:00:00Z',
          publishedAt: null,
          sourceWriteId: null,
          comments: [
            {
              draftCommentId: 'comment-1',
              severity: 'RED',
              title: 'Return refreshed token',
              body: 'The refresh path should return the new token.',
              path: 'src/Auth/RefreshTokenStore.cs',
              line: 88,
              side: 'RIGHT',
              startLine: null,
              startSide: null,
              suggestionOriginal: 'return token;',
              suggestionReplacement: 'return refreshed;',
              commentOnlyReason: null,
              status: 'accepted',
              warning: null,
              resolutionState: 'open',
              resolutionKind: null,
              resolvedByKind: null,
              resolutionNote: null,
              resolvedAt: null,
            },
            {
              draftCommentId: 'comment-2',
              severity: 'YELLOW',
              title: 'Validate middleware setup',
              body: 'This needs an operator decision before a replacement is safe.',
              path: 'src/Auth/JwtMiddleware.cs',
              line: 22,
              side: 'RIGHT',
              startLine: null,
              startSide: null,
              suggestionOriginal: null,
              suggestionReplacement: null,
              commentOnlyReason: 'needsHumanDecision',
              status: 'accepted',
              warning: null,
              resolutionState: 'open',
              resolutionKind: null,
              resolvedByKind: null,
              resolutionNote: null,
              resolvedAt: null,
            },
          ],
        },
      ],
    }

    renderDetail({
      selectedItem: reviewItem,
      selectedDetailItem: reviewItem,
      selectedReviewStage: 'review',
      selectedIsLocalTask: false,
      selectedIsPullRequest: true,
      publishReviewDraft,
      reviewDraftPublishDisabledReason: reason,
    })

    const publish = screen.getByRole('button', { name: 'Publish' })
    expect(screen.getByText(/1 code suggestion .* 1 comment-only finding/)).toBeInTheDocument()
    expect(screen.getByText('Comment-only: Needs human decision')).toBeInTheDocument()
    expect(screen.getByLabelText('Suggested replacement diff preview')).toBeInTheDocument()
    expect(publish).toBeDisabled()
    fireEvent.click(publish)
    expect(publishReviewDraft).not.toHaveBeenCalled()

    const trigger = publish.closest('.button-tooltip-trigger')
    expect(trigger).not.toBeNull()
    fireEvent.pointerEnter(trigger as HTMLElement)

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(reason)
    })
  })

  it('renders finding resolution controls and chips on a published draft', () => {
    const resolveReviewFinding = vi.fn(async () => undefined)
    const reopenReviewFinding = vi.fn(async () => undefined)
    const baseComment = {
      severity: 'YELLOW',
      title: 'Preserve redirect',
      body: 'Why this matters.',
      path: 'docs/config.mts',
      line: 241,
      side: 'RIGHT',
      startLine: null,
      startSide: null,
      suggestionOriginal: null,
      suggestionReplacement: null,
      commentOnlyReason: 'investigateOnly',
      status: 'accepted' as const,
      warning: null,
    }
    const reviewItem: WorkItem = {
      ...item,
      reviewDrafts: [
        {
          draftId: 'draft-1',
          itemId: 'task-1',
          roundId: 'round-1',
          runId: 'run-1',
          status: 'published',
          summaryBody: 'Reviewed.',
          majorCount: 0,
          minorCount: 1,
          suggestionCount: 0,
          warnings: [],
          acceptedCount: 2,
          warningCount: 0,
          resolvedCount: 1,
          createdAt: '2026-05-10T00:00:00Z',
          updatedAt: '2026-05-10T00:00:00Z',
          publishedAt: '2026-05-10T00:00:00Z',
          sourceWriteId: 'write-1',
          comments: [
            { ...baseComment, draftCommentId: 'open-1', resolutionState: 'open', resolutionKind: null, resolvedByKind: null, resolutionNote: null, resolvedAt: null },
            { ...baseComment, draftCommentId: 'resolved-1', title: 'Already handled', resolutionState: 'resolved', resolutionKind: 'dismissed', resolvedByKind: 'agent', resolutionNote: 'Agreed non-issue.', resolvedAt: '2026-05-10T01:00:00Z' },
          ],
        },
      ],
    }

    renderDetail({
      selectedItem: reviewItem,
      selectedDetailItem: reviewItem,
      selectedReviewStage: 'review',
      selectedIsLocalTask: false,
      selectedIsPullRequest: true,
      resolveReviewFinding,
      reopenReviewFinding,
    })

    expect(screen.getByText(/2 accepted · 0 warning · 1 resolved/)).toBeInTheDocument()
    expect(screen.getByText('Agreed non-issue.')).toBeInTheDocument()
    const chip = document.querySelector('.draft-comment.resolved .resolution-chip')
    expect(chip?.textContent).toContain('Dismissed')

    fireEvent.click(screen.getByRole('button', { name: 'Mark fixed' }))
    expect(resolveReviewFinding).toHaveBeenCalledWith('draft-1', 'open-1', 'fixed', null)

    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(reopenReviewFinding).toHaveBeenCalledWith('draft-1', 'resolved-1')
  })

  it('focuses the discussion composer when the detail focus requests comments', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    renderDetail({
      selectedReviewStage: 'review',
      selectedDetailFocus: 'discussionComposer',
    })

    const composer = screen.getAllByPlaceholderText('Add an internal note, next-round feedback, or an agent question')[0]
    await waitFor(() => expect(composer).toHaveFocus())
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('renders the PR re-review shortcut when a newer head is available', () => {
    const reReviewPullRequest = vi.fn()
    const reviewItem: WorkItem = {
      ...item,
      sourceKey: 'github',
      source: 'GitHub',
      kind: 'pullRequest',
      type: 'pr',
      state: 'awaitingReview',
      taskStatus: 'in_review',
      headSha: 'def456',
    }

    renderDetail({
      selectedItem: reviewItem,
      selectedDetailItem: reviewItem,
      selectedReviewStage: 'review',
      selectedIsLocalTask: false,
      selectedIsPullRequest: true,
      reReviewInfo: {
        previousHeadSha: 'abc123',
        currentHeadSha: 'def456',
        description: 'PR moved from abc123 to def456 since the last Oratorio review.',
      },
      reReviewPullRequest,
    })

    expect(screen.getByRole('heading', { name: 'Review latest commit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Re-review PR' }))
    expect(reReviewPullRequest).toHaveBeenCalledOnce()
  })
})

function renderDetail(overrides: Partial<ComponentProps<typeof ItemDetailView>> = {}) {
  return render(renderDetailElement(overrides))
}

function renderDetailElement(overrides: Partial<ComponentProps<typeof ItemDetailView>> = {}) {
  return (
    <ItemDetailView
      selectedItem={item}
      selectedRun={undefined}
      selectedDetailItem={item}
      selectedReviewStage="intake"
      selectedIsLocalTask
      selectedIsPullRequest={false}
      selectedCanEditLocalTask
      selectedCanReopen={false}
      selectedCanArchive
      selectedCanDispatch
      selectedCanImplementationDispatch
      selectedCanDecide
      selectedHasSourceMetadata={false}
      selectedBrief={{
        summary: 'Keep the current review detail stable while splitting modules.',
        keyDetails: '',
        whyItMatters: '',
        desiredOutcome: '',
      }}
      selectedRoundHistory={[]}
      selectedSourceActivity={[]}
      visibleSourceActivity={[]}
      hiddenSourceActivity={[]}
      reviewInspectorOpen={false}
      setReviewInspectorOpen={syncAction}
      actionMenuItemId={null}
      setActionMenuItemId={syncAction}
      isBusy={false}
      error={null}
      feedbackDraft=""
      setFeedbackDraft={syncAction}
      decisionNote=""
      setDecisionNote={syncAction}
      runnerMode="appServer"
      showTechnicalEventsByRound={{}}
      openEditLocalTask={syncAction}
      reopenSelectedItem={syncAction}
      archiveSelectedItem={asyncAction}
      refreshSelectedItem={asyncAction}
      copySelectedItemId={asyncAction}
      setSelectedReviewStage={syncAction}
      dispatchImplementationRound={syncAction}
      dispatchRound={syncAction}
      reReviewInfo={null}
      reReviewPullRequest={syncAction}
      retrySourceWrite={asyncAction}
      publishReviewDraft={asyncAction}
      discardReviewDraft={asyncAction}
      resolveReviewFinding={asyncAction}
      reopenReviewFinding={asyncAction}
      deliverImplementationDraft={asyncAction}
      discardFollowUpDraft={asyncAction}
      createLocalTaskFromFollowUpDraft={asyncAction}
      editFollowUpDraft={asyncAction}
      editReviewDraftSummary={asyncAction}
      addComment={syncAction}
      setDecision={syncAction}
      toggleAllTechnicalEvents={syncAction}
      toggleTechnicalEvents={syncAction}
      startSidecarResize={syncAction}
      moveSidecarResize={syncAction}
      stopSidecarResize={syncAction}
      {...overrides}
    />
  )
}
