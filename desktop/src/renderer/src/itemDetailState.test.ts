import { describe, expect, it } from 'vitest'
import {
  detailMatchesSelection,
  replaceMatchingItemWithDetail,
  shouldApplyDetailResponse,
  type WorkItemIdentity,
} from './itemDetailState'

type TestItem = WorkItemIdentity & {
  description: string
  sourceSnapshot: string | null
}

describe('item detail state helpers', () => {
  it('keeps loaded detail fields when a matching summary item is reconciled by source identity', () => {
    const summary: TestItem = {
      id: 'github:1',
      sourceKey: 'github',
      externalId: '1',
      description: '',
      sourceSnapshot: null,
    }
    const detail: TestItem = {
      id: 'item-1',
      sourceKey: 'github',
      externalId: '1',
      description: '## Summary\nLoaded brief',
      sourceSnapshot: 'snapshot-1',
    }

    const [reconciled] = replaceMatchingItemWithDetail([summary], detail)

    expect(reconciled.id).toBe(summary.id)
    expect(reconciled.description).toBe(detail.description)
    expect(reconciled.sourceSnapshot).toBe(detail.sourceSnapshot)
  })

  it('treats detail as selected when the list still uses the source-derived id', () => {
    const summary = { id: 'github:1', sourceKey: 'github', externalId: '1' }
    const detail = { id: 'item-1', sourceKey: 'github', externalId: '1' }

    expect(detailMatchesSelection(detail, summary.id, summary)).toBe(true)
  })

  it('rejects stale detail responses from older requests', () => {
    const requested = { id: 'github:1', sourceKey: 'github', externalId: '1' }
    const detail = { id: 'item-1', sourceKey: 'github', externalId: '1' }

    expect(shouldApplyDetailResponse(1, 2, requested, detail, requested.id)).toBe(false)
  })

  it('rejects detail responses after selection moved to another item', () => {
    const requested = { id: 'github:1', sourceKey: 'github', externalId: '1' }
    const detail = { id: 'item-1', sourceKey: 'github', externalId: '1' }

    expect(shouldApplyDetailResponse(2, 2, requested, detail, 'github:2')).toBe(false)
  })
})
