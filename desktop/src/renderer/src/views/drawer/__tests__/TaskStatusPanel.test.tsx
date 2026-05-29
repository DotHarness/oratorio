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
      />,
    )

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
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'View comments' })[0])
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('review', { focus: 'discussionComposer' })

    rerender(
      <TaskStatusPanel
        item={makeItem({ state: 'awaitingReview' })}
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

    fireEvent.click(screen.getByRole('button', { name: 'Record decision' }))
    expect(onOpenDetailStage).toHaveBeenLastCalledWith('decision', undefined)
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
