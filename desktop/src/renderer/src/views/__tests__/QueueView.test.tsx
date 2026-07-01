import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueueView } from '../QueueView'
import type { WorkItem } from '../../lib/types'

describe('QueueView', () => {
  it('uses compact source project labels for GitLab item metadata', () => {
    const item = makeItem({
      sourceKey: 'gitlab',
      source: 'GitLab',
      repository: 'gitlab:gitlab.example.test/group-alpha/team-alpha/project-alpha',
    })

    render(
      <QueueView
        query=""
        setQuery={vi.fn()}
        stateFilter="all"
        setStateFilter={vi.fn()}
        repositoryFilter="all"
        repositories={['gitlab:gitlab.example.test/group-alpha/team-alpha/project-alpha']}
        setRepositoryFilter={vi.fn()}
        openCreateLocalTask={vi.fn()}
        refreshAll={vi.fn(async () => undefined)}
        visibleItems={[item]}
        selectedItem={null}
        openItemFromQueue={vi.fn()}
      />,
    )

    expect(screen.getByText('team-alpha/project-alpha #4')).toBeInTheDocument()
    expect(screen.queryByText(/gitlab:gitlab\.example\.test/)).not.toBeInTheDocument()
  })
})

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'item-1',
    itemId: 'item-1',
    sourceKey: overrides.sourceKey ?? 'local',
    externalId: 'mr:gitlab.example.test/group-alpha/team-alpha/project-alpha!4',
    currentRunId: null,
    type: 'pr',
    kind: 'pullRequest',
    number: '#4',
    title: 'Queue GitLab item',
    description: '',
    repository: overrides.repository ?? 'local',
    source: overrides.source ?? 'Local',
    state: 'discovered',
    shortId: 'DEF-4',
    taskStatus: 'todo',
    boardSortOrder: 0,
    assignee: 'operator',
    branch: 'main',
    updated: 'just now',
    sourceUpdated: null,
    lastSourceSync: null,
    sourceState: 'open',
    sourceClosedAt: null,
    sourceMergedAt: null,
    archiveReason: null,
    round: 1,
    severity: 'medium',
    check: 'notConfigured',
    summary: 'No agent summary is available yet.',
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
