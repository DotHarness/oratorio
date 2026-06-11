import { describe, expect, it } from 'vitest'
import { liveActivityTail, reduceLiveActivity, type LiveActivity } from '../liveActivity'
import type { DrawerStreamEvent } from '../types'

function itemEvent(
  type: DrawerStreamEvent['type'],
  itemType: string,
  text?: string,
  runId = 'run-1',
): DrawerStreamEvent {
  return {
    type,
    runId,
    payload: {
      id: 'item-1',
      type: itemType,
      status: 'started',
      payload: text === undefined ? {} : { text },
      streaming: true,
    },
  }
}

describe('reduceLiveActivity', () => {
  it('maps AppServer item types to activity verbs', () => {
    expect(reduceLiveActivity(null, itemEvent('drawer/item.started', 'reasoningContent'))?.kind).toBe('thinking')
    expect(reduceLiveActivity(null, itemEvent('drawer/item.started', 'agentMessage'))?.kind).toBe('writing')
    expect(reduceLiveActivity(null, itemEvent('drawer/item.started', 'commandExecution'))?.kind).toBe('command')
    expect(reduceLiveActivity(null, itemEvent('drawer/item.started', 'toolCall'))?.kind).toBe('tool')
    expect(reduceLiveActivity(null, itemEvent('drawer/item.started', 'somethingElse'))?.kind).toBe('working')
  })

  it('carries a text tail only for agent text and reasoning', () => {
    expect(reduceLiveActivity(null, itemEvent('drawer/item.delta', 'agentMessage', 'first line\nsecond line'))?.tail).toBe(
      'second line',
    )
    expect(reduceLiveActivity(null, itemEvent('drawer/item.delta', 'commandExecution', 'git diff'))?.tail).toBeNull()
  })

  it('clears on a terminal run status but keeps it while running', () => {
    const prev: LiveActivity = { runId: 'run-1', kind: 'writing', tail: 'in progress' }
    const running: DrawerStreamEvent = { type: 'drawer/run/status', runId: 'run-1', payload: { status: 'running' } as never }
    const done: DrawerStreamEvent = { type: 'drawer/run/status', runId: 'run-1', payload: { status: 'succeeded' } as never }
    expect(reduceLiveActivity(prev, running)).toBe(prev)
    expect(reduceLiveActivity(prev, done)).toBeNull()
  })

  it('keeps the previous activity across unrelated events', () => {
    const prev: LiveActivity = { runId: 'run-1', kind: 'thinking', tail: null }
    const completed: DrawerStreamEvent = { type: 'drawer/item.completed', runId: 'run-1', payload: {} }
    const plan: DrawerStreamEvent = { type: 'drawer/plan/updated', runId: 'run-1', payload: {} }
    expect(reduceLiveActivity(prev, completed)).toBe(prev)
    expect(reduceLiveActivity(prev, plan)).toBe(prev)
  })
})

describe('liveActivityTail', () => {
  it('returns the last non-empty line, whitespace-collapsed', () => {
    expect(liveActivityTail('one\n\n  two   words  ')).toBe('two words')
  })

  it('clamps long text and appends an ellipsis', () => {
    const tail = liveActivityTail('x'.repeat(200))
    expect(tail).toHaveLength(120)
    expect(tail?.endsWith('…')).toBe(true)
  })

  it('returns null for empty or non-string input', () => {
    expect(liveActivityTail('   ')).toBeNull()
    expect(liveActivityTail(undefined)).toBeNull()
    expect(liveActivityTail(42)).toBeNull()
  })
})
