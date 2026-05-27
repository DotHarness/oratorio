import { describe, expect, it } from 'vitest'
import { parseTaskSearchQuery, taskMatchesSearch, taskSearchApiSource } from '../taskSearch'
import type { WorkItem } from '../types'

describe('task search parsing', () => {
  it('extracts source and label qualifiers while preserving plain text', () => {
    expect(parseTaskSearchQuery('s:github source:local l:frontend label:bug review queue')).toEqual({
      text: 'review queue',
      sources: ['github', 'local'],
      labels: ['frontend', 'bug'],
    })
  })

  it('supports quoted label values with spaces', () => {
    expect(parseTaskSearchQuery('review l:"good first issue" source:GitHub')).toEqual({
      text: 'review',
      sources: ['GitHub'],
      labels: ['good first issue'],
    })
  })

  it('maps a single source qualifier to the existing API source parameter', () => {
    expect(taskSearchApiSource(parseTaskSearchQuery('source:GitHub review'))).toBe('github')
    expect(taskSearchApiSource(parseTaskSearchQuery('s:github source:GitHub review'))).toBe('github')
    expect(taskSearchApiSource(parseTaskSearchQuery('s:github s:local review'))).toBeNull()
  })

  it('requires every advanced qualifier to match', () => {
    const item = makeItem()

    expect(taskMatchesSearch(item, parseTaskSearchQuery('s:github l:frontend review'))).toBe(true)
    expect(taskMatchesSearch(item, parseTaskSearchQuery('source:GitHub label:Frontend review'))).toBe(true)
    expect(taskMatchesSearch(item, parseTaskSearchQuery('s:github l:frontend l:bug review'))).toBe(false)
    expect(taskMatchesSearch(item, parseTaskSearchQuery('s:local l:frontend review'))).toBe(false)
  })
})

function makeItem(): WorkItem {
  return {
    sourceKey: 'github',
    source: 'GitHub',
    shortId: 'DEF-7',
    title: 'Review generated patch',
    repository: 'example-owner/oratorio',
    number: '#42',
    assignee: 'operator',
    branch: 'main',
    labels: ['Frontend'],
    headSha: 'abcdef0',
  } as WorkItem
}
