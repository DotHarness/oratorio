import { describe, expect, it } from 'vitest'
import { localTaskAssigneeOptions, localTaskBranchOptions } from '../format'

describe('local task option helpers', () => {
  it('builds recent assignee options without unassigned placeholders', () => {
    expect(localTaskAssigneeOptions([
      { assignee: 'mika' },
      { assignee: 'unassigned' },
      { assignee: 'zoe' },
      { assignee: 'mika' },
      { assignee: '' },
    ])).toEqual(['mika', 'zoe'])
  })

  it('prioritizes branches from the selected repository and keeps main as fallback', () => {
    expect(localTaskBranchOptions([
      { repository: 'example-owner/oratorio', branch: 'feature/local-task-form' },
      { repository: 'example-owner/other-repo', branch: 'release/next' },
      { repository: 'example-owner/oratorio', branch: 'main' },
      { repository: 'example-owner/oratorio', branch: 'no branch' },
      { repository: 'example-owner/other-repo', branch: 'feature/local-task-form' },
    ], 'example-owner/oratorio')).toEqual(['feature/local-task-form', 'main', 'release/next'])
  })
})
