import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskDrawer } from '../TaskDrawer'
import type { WorkItem } from '../../lib/types'

describe('TaskDrawer', () => {
  afterEach(cleanup)

  it('renders status tab content and closes with Escape', () => {
    const onClose = vi.fn()
    const onOpenDetailPage = vi.fn()

    render(
      <TaskDrawer
        item={makeItem()}
        onClose={onClose}
        onResizeStart={vi.fn()}
        onResizeMove={vi.fn()}
        onResizeEnd={vi.fn()}
        actionMenuOpen
        onOpenDetailPage={onOpenDetailPage}
        statusContent={<p>Status panel content</p>}
      />,
    )

    expect(screen.getByRole('complementary', { name: /Task drawer for DEF-1/ })).toBeInTheDocument()
    expect(screen.getByText('Status panel content')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Open detail page' }))
    expect(onOpenDetailPage).toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
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
    title: 'Test drawer task',
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
  }
}
