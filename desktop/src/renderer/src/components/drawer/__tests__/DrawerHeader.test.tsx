import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkItem } from '../../../lib/types'
import { DrawerHeader } from '../DrawerHeader'

describe('DrawerHeader', () => {
  it('shows status copy and exposes menu actions', () => {
    const onToggleActionMenu = vi.fn()
    const onOpenDetailPage = vi.fn()

    render(
      <DrawerHeader
        item={makeItem()}
        onClose={vi.fn()}
        actionMenuOpen
        onToggleActionMenu={onToggleActionMenu}
        canEditLocalTask
        canArchive
        onEditLocalTask={vi.fn()}
        onOpenDetailPage={onOpenDetailPage}
        onArchive={vi.fn()}
        onCopyId={vi.fn()}
      />,
    )

    expect(screen.getByText('This item is eligible for a new Oratorio round.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'More task actions' }))

    expect(onToggleActionMenu).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open detail page' }))
    expect(onOpenDetailPage).toHaveBeenCalled()
    expect(screen.getByRole('menuitem', { name: 'Edit local task' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archive task' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy task id' })).toBeInTheDocument()
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
    title: 'Drawer header task',
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
