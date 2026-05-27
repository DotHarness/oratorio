import { describe, expect, it } from 'vitest'
import { pullRequestReReviewInfo } from '../format'
import type { WorkItem } from '../types'

describe('pullRequestReReviewInfo', () => {
  it('returns a re-review hint only when a source review target head changed after review', () => {
    const item = makePullRequest()

    expect(pullRequestReReviewInfo(item)).toEqual({
      previousHeadSha: 'abc123',
      currentHeadSha: 'def456',
      description: 'Review target moved from abc123 to def456 since the last Oratorio review.',
    })

    expect(pullRequestReReviewInfo({ ...item, sourceKey: 'gitlab', source: 'GitLab' })).toEqual({
      previousHeadSha: 'abc123',
      currentHeadSha: 'def456',
      description: 'Review target moved from abc123 to def456 since the last Oratorio review.',
    })

    expect(pullRequestReReviewInfo({ ...item, headSha: 'abc123' })).toBeNull()
    expect(pullRequestReReviewInfo({ ...item, state: 'dispatching' })).toBeNull()
    expect(pullRequestReReviewInfo({ ...item, state: 'rejected' })).toBeNull()
    expect(pullRequestReReviewInfo({ ...item, kind: 'issue' })).toBeNull()
  })
})

function makePullRequest(): WorkItem {
  return {
    id: 'github:pr-184',
    itemId: 'item-184',
    sourceKey: 'github',
    externalId: 'pr:example-owner/oratorio#184',
    currentRunId: null,
    type: 'pr',
    kind: 'pullRequest',
    number: '#184',
    title: 'Refresh auth flow',
    description: '',
    repository: 'example-owner/oratorio',
    source: 'GitHub',
    state: 'awaitingReview',
    shortId: 'DEF-184',
    taskStatus: 'in_review',
    boardSortOrder: 0,
    assignee: 'kai',
    branch: 'feature/auth-refresh',
    updated: 'just now',
    sourceUpdated: null,
    lastSourceSync: null,
    sourceState: 'open',
    sourceClosedAt: null,
    sourceMergedAt: null,
    archiveReason: null,
    round: 1,
    severity: 'medium',
    check: 'attention',
    summary: '',
    externalUrl: null,
    labels: [],
    isDraft: false,
    headSha: 'def456',
    sourceSnapshot: null,
    comments: [],
    sourceComments: [],
    sourceWrites: [],
    reviewDrafts: [],
    implementationDrafts: [],
    followUpDrafts: [],
    discussionTurns: [],
    rounds: [],
    decisions: [],
    runs: [
      {
        runId: 'run-1',
        roundId: 'round-1',
        attempt: 1,
        status: 'succeeded',
        runnerKind: 'appServer',
        threadId: 'thread-1',
        turnId: 'turn-1',
        appServerEndpoint: 'ws://appserver',
        startedAt: '2026-05-01T00:00:00Z',
        completedAt: '2026-05-01T00:01:00Z',
        summary: 'Reviewed.',
        errorCode: null,
        errorMessage: null,
        progressPercent: 100,
        statusMessage: null,
        lastHeartbeatAt: null,
        baseWorkspacePath: null,
        worktreePath: null,
        worktreeBranch: null,
        baseRef: 'abc123',
        baseSha: 'abc123',
        worktreeStatus: 'notRequired',
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
      },
    ],
    timeline: [],
    parentItemId: null,
    generatedFromDraftId: null,
  }
}
