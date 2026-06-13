import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Run, WorkItem } from '../../../lib/types'
import { TaskStatusPanel } from '../TaskStatusPanel'

describe('TaskStatusPanel', () => {
  afterEach(cleanup)

  it('renders a compact board-focused task summary', () => {
    render(
      <TaskStatusPanel
        item={makeItem()}
        run={undefined}
        brief={{ summary: 'Compact board brief.', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="appServer"
        canDispatch
        canImplementationDispatch
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={vi.fn()}
      />,
    )

    // The state is already conveyed by the drawer header; the panel must not echo it as a redundant block.
    expect(screen.queryByRole('heading', { name: 'Discovered' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.getByText('Compact board brief.')).toBeInTheDocument()
    expect(screen.queryByText('More run options')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Implement/ })).not.toHaveAttribute('title')
    expect(screen.getByRole('button', { name: /Auto PR/ })).not.toHaveAttribute('title')
    expect(screen.getByRole('button', { name: /Review only/ })).not.toHaveAttribute('title')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerEnter(screen.getByRole('button', { name: /Implement/ }))
    expect(screen.getByRole('tooltip')).toHaveTextContent(/manual delivery/)
  })

  it('renders a loading skeleton while the detail fetch is in flight', () => {
    const { container } = render(
      <TaskStatusPanel
        item={makeItem()}
        loading
        run={undefined}
        brief={{ summary: 'Compact board brief.', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="appServer"
        canDispatch
        canImplementationDispatch
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('.task-status-skeleton-card')).toHaveLength(3)
    // Real content is suppressed while the skeleton is shown.
    expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument()
    expect(screen.queryByText('Compact board brief.')).not.toBeInTheDocument()
  })

  it('opens detail stages from artifact navigation controls', () => {
    const onOpenDetailStage = vi.fn()
    render(
      <TaskStatusPanel
        item={makeItem({
          comments: [{} as WorkItem['comments'][number]],
          sourceWrites: [{} as WorkItem['sourceWrites'][number]],
          reviewDrafts: [makeReviewDraft()],
          followUpDrafts: [makeFollowUpDraft()],
        })}
        run={undefined}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="mock"
        canDispatch={false}
        canImplementationDispatch={false}
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={onOpenDetailStage}
      />,
    )

    expect(screen.getByText(/Open the detail panel to review drafts/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /1 review drafts/i }))
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('review')

    fireEvent.click(screen.getByRole('button', { name: /1 follow-ups/i }))
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('review')

    fireEvent.click(screen.getByRole('button', { name: /1 writes/i }))
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('decision')

    fireEvent.click(screen.getByRole('button', { name: /1 comments/i }))
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('review', { focus: 'discussionComposer' })
  })

  it('keeps runner internals and task snapshot out of the drawer summary', () => {
    const threadId = 'thread_abcdef1234567890'
    render(
      <TaskStatusPanel
        item={makeItem({
          state: 'running',
          taskStatus: 'in_progress',
          assignee: 'operator',
          branch: 'feature/drawer-slim',
          repository: 'example-owner/oratorio',
        })}
        run={makeRun({ threadId })}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="appServer"
        canDispatch={false}
        canImplementationDispatch={false}
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={vi.fn()}
      />,
    )

    expect(screen.getByText('DotCraft attempt 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Run progress')).toBeInTheDocument()
    expect(screen.queryByText('Thread')).not.toBeInTheDocument()
    expect(screen.queryByText('Worktree')).not.toBeInTheDocument()
    expect(screen.queryByText('Snapshot')).not.toBeInTheDocument()
    expect(screen.queryByTitle(threadId)).not.toBeInTheDocument()
    expect(screen.queryByText('example-owner/oratorio')).not.toBeInTheDocument()
    expect(screen.queryByText('feature/drawer-slim')).not.toBeInTheDocument()
  })

  it('prioritizes unresolved review actions in the drawer primary CTA', () => {
    const onOpenDetailStage = vi.fn()
    const onRecordDecision = vi.fn()
    const { rerender } = render(
      <TaskStatusPanel
        item={makeItem({
          state: 'awaitingReview',
          reviewDrafts: [makeReviewDraft()],
          implementationDrafts: [makeImplementationDraft()],
          followUpDrafts: [makeFollowUpDraft()],
          comments: [{} as WorkItem['comments'][number]],
        })}
        run={undefined}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="mock"
        canDispatch={false}
        canImplementationDispatch={false}
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={onOpenDetailStage}
        onRecordDecision={onRecordDecision}
      />,
    )

    const draftHeading = screen.getByRole('heading', { name: 'Review agent draft' })
    const decisionHeading = screen.getByRole('heading', { name: 'Review decision' })
    expect(Boolean(draftHeading.compareDocumentPosition(decisionHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Review agent draft' }))
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('review', undefined)

    rerender(
      <TaskStatusPanel
        item={makeItem({
          state: 'awaitingReview',
          implementationDrafts: [makeImplementationDraft()],
          followUpDrafts: [makeFollowUpDraft()],
          comments: [{} as WorkItem['comments'][number]],
        })}
        run={undefined}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="mock"
        canDispatch={false}
        canImplementationDispatch={false}
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={onOpenDetailStage}
        onRecordDecision={onRecordDecision}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Review delivery draft' }))
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('review', undefined)

    rerender(
      <TaskStatusPanel
        item={makeItem({
          state: 'awaitingReview',
          followUpDrafts: [makeFollowUpDraft()],
          comments: [{} as WorkItem['comments'][number]],
        })}
        run={undefined}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="mock"
        canDispatch={false}
        canImplementationDispatch={false}
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={onOpenDetailStage}
        onRecordDecision={onRecordDecision}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Review follow-ups' }))
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('review', undefined)

    rerender(
      <TaskStatusPanel
        item={makeItem({
          state: 'awaitingReview',
          comments: [{} as WorkItem['comments'][number]],
        })}
        run={undefined}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="mock"
        canDispatch={false}
        canImplementationDispatch={false}
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={onOpenDetailStage}
        onRecordDecision={onRecordDecision}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Review decision' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'View comments' })[0])
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('review', { focus: 'discussionComposer' })
  })

  it('records review decisions from the drawer action block', () => {
    const onRecordDecision = vi.fn()
    render(
      <TaskStatusPanel
        item={makeItem({ state: 'awaitingReview' })}
        run={undefined}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="mock"
        canDispatch={false}
        canImplementationDispatch={false}
        canDecide
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={vi.fn()}
        onRecordDecision={onRecordDecision}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Record decision' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject...' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onRecordDecision).toHaveBeenLastCalledWith('approve')

    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))
    const sendRequest = screen.getByRole('button', { name: 'Send request' })
    expect(sendRequest).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Describe what needs to change before this can be accepted.'), { target: { value: 'Please update the tests.' } })
    expect(sendRequest).not.toBeDisabled()
    fireEvent.click(sendRequest)
    expect(onRecordDecision).toHaveBeenLastCalledWith('request-changes', 'Please update the tests.')

    fireEvent.click(screen.getByRole('button', { name: 'Reject...' }))
    expect(screen.getByRole('alertdialog', { name: 'Confirm rejection from the task drawer' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Optional context for why this is rejected.'), { target: { value: 'Wrong direction.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onRecordDecision).toHaveBeenLastCalledWith('reject', 'Wrong direction.')
  })

  it('shows a PR re-review shortcut when the pull request head moved', () => {
    const onReReviewPullRequest = vi.fn()
    render(
      <TaskStatusPanel
        item={makeItem({
          sourceKey: 'github',
          kind: 'pullRequest',
          type: 'pr',
          state: 'awaitingReview',
          taskStatus: 'in_review',
          headSha: 'def456',
        })}
        run={undefined}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="appServer"
        canDispatch
        canImplementationDispatch={false}
        isPullRequest
        reReviewInfo={{
          previousHeadSha: 'abc123',
          currentHeadSha: 'def456',
          description: 'PR moved from abc123 to def456 since the last Oratorio review.',
        }}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={onReReviewPullRequest}
        onOpenDetailStage={vi.fn()}
      />,
    )

    expect(screen.getByText('PR moved from abc123 to def456 since the last Oratorio review.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Re-review PR' }))
    expect(onReReviewPullRequest).toHaveBeenCalledOnce()
  })

  it('shows the live activity verb and tail as a single clipped line while a run streams', () => {
    const longTail = 'updating the retry path with enough streamed detail to overflow the compact drawer status line desktopActivation.tsx'.repeat(3)

    render(
      <TaskStatusPanel
        item={makeItem({ state: 'running' })}
        run={makeRun({ status: 'running' })}
        liveActivity={{ runId: 'run-1', kind: 'writing', tail: longTail }}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="appServer"
        canDispatch={false}
        canImplementationDispatch={false}
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={vi.fn()}
      />,
    )

    const liveLine = document.querySelector('.task-status-live-line')
    expect(liveLine).toBeInTheDocument()
    expect(liveLine).toHaveTextContent(`Writing · ${longTail}`)
    expect(liveLine?.closest('section')).toHaveClass('task-status-run-section', 'task-status-run-section--live')
    expect(screen.getByText(/updating the retry path/)).toHaveClass('task-status-live-tail')
    expect(screen.queryByText('DotCraft agent is producing output.')).not.toBeInTheDocument()
  })

  it('falls back to the run heartbeat message when there is no live activity', () => {
    render(
      <TaskStatusPanel
        item={makeItem({ state: 'running' })}
        run={makeRun({ status: 'running' })}
        liveActivity={null}
        brief={{ summary: '', keyDetails: '', whyItMatters: '', desiredOutcome: '' }}
        runnerMode="appServer"
        canDispatch={false}
        canImplementationDispatch={false}
        isPullRequest={false}
        reReviewInfo={null}
        onDispatchRound={vi.fn()}
        onDispatchImplementationRound={vi.fn()}
        onReReviewPullRequest={vi.fn()}
        onOpenDetailStage={vi.fn()}
      />,
    )

    expect(screen.getByText('DotCraft agent is producing output.')).toBeInTheDocument()
    expect(document.querySelector('.task-status-run-section')).toBeInTheDocument()
    expect(document.querySelector('.task-status-run-section--live')).not.toBeInTheDocument()
  })
})

function makeReviewDraft(): WorkItem['reviewDrafts'][number] {
  return { status: 'draft' } as WorkItem['reviewDrafts'][number]
}

function makeImplementationDraft(): WorkItem['implementationDrafts'][number] {
  return { status: 'draft' } as WorkItem['implementationDrafts'][number]
}

function makeFollowUpDraft(): WorkItem['followUpDrafts'][number] {
  return { status: 'draft' } as WorkItem['followUpDrafts'][number]
}

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: 'run-1',
    roundId: 'round-1',
    attempt: 1,
    status: 'running',
    runnerKind: 'appServer',
    threadId: null,
    turnId: null,
    appServerEndpoint: null,
    startedAt: '2026-05-17T00:00:00Z',
    completedAt: null,
    summary: null,
    errorCode: null,
    errorMessage: null,
    progressPercent: 68,
    statusMessage: 'DotCraft agent is producing output.',
    lastHeartbeatAt: null,
    baseWorkspacePath: null,
    worktreePath: null,
    worktreeBranch: null,
    baseRef: null,
    baseSha: null,
    worktreeStatus: 'ready',
    worktreeErrorCode: null,
    worktreeErrorMessage: null,
    retryCount: 0,
    nextRetryAt: null,
    leaseOwner: null,
    leaseAcquiredAt: null,
    worktreeCleanupAfterAt: null,
    worktreeCleanedAt: null,
    purpose: 'reviewAnalysis',
    dispatchTrigger: 'manual',
    targetHeadSha: null,
    deliveryPolicy: 'manualDelivery',
    implementationTurnCount: 0,
    ...overrides,
  }
}

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'item-1',
    itemId: 'item-1',
    sourceKey: 'local',
    externalId: 'task:test',
    currentRunId: null,
    type: 'task',
    kind: 'localTask',
    number: 'local',
    title: 'Compact drawer task',
    description: 'Drawer task description.',
    repository: 'example-owner/oratorio',
    source: 'Local',
    state: 'discovered',
    shortId: 'DEF-1',
    taskStatus: 'todo',
    boardSortOrder: 0,
    assignee: 'operator',
    branch: 'main',
    updated: 'just now',
    sourceUpdated: null,
    lastSourceSync: null,
    sourceState: 'unknown',
    sourceClosedAt: null,
    sourceMergedAt: null,
    archiveReason: null,
    round: 0,
    severity: 'medium',
    check: 'notConfigured',
    summary: '',
    externalUrl: null,
    labels: [],
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
    ...overrides,
  }
}
