import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ItemDetailViewProps } from '../ItemDetailView'
import { TaskDetailPage } from '../TaskDetailPage'
import type { WorkItem } from '../../lib/types'

vi.mock('../ItemDetailView', () => ({
  ItemDetailView: () => (
    <div>
      <h1>Focused task detail</h1>
      <div>Full review console</div>
    </div>
  ),
}))

describe('TaskDetailPage', () => {
  it('renders task chrome and delegates navigation actions', () => {
    const onBackToBoard = vi.fn()

    render(
      <TaskDetailPage
        item={makeItem()}
        itemDetailProps={{} as ItemDetailViewProps}
        activeStage="review"
        onBackToBoard={onBackToBoard}
      />,
    )

    expect(screen.getAllByRole('heading', { name: 'Focused task detail' })).toHaveLength(1)
    expect(screen.getByText('Full review console')).toBeInTheDocument()
    expect(screen.getByText('Stage: review')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back to board' }))

    expect(onBackToBoard).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Open drawer' })).not.toBeInTheDocument()
  })
})

function makeItem(): WorkItem {
  return {
    id: 'item-1',
    itemId: 'item-1',
    sourceKey: 'local',
    externalId: 'task:test',
    currentRunId: null,
    type: 'task',
    kind: 'localTask',
    number: 'local',
    title: 'Focused task detail',
    description: 'Drawer task description.',
    repository: 'example-owner/oratorio',
    source: 'Local',
    state: 'awaitingReview',
    shortId: 'DEF-1',
    taskStatus: 'in_review',
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
    round: 1,
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
  }
}
