import type { ConversationItem, DrawerStreamEvent, RunSummary } from './types'

/**
 * Live activity is the single-line, ephemeral status the drawer shows while a
 * run streams (frontend spec §4). It is derived from the focused run's drawer
 * events and never persisted: a short verb plus an optional truncated tail of
 * the latest streamed agent text. It is not an AppServer conversation row.
 */
export type LiveActivityKind = 'thinking' | 'writing' | 'command' | 'tool' | 'working'

export type LiveActivity = {
  runId: string
  kind: LiveActivityKind
  tail: string | null
}

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'completed', 'failed', 'cancelled', 'timedOut'])
const TAIL_MAX_LENGTH = 120

function activityKindForItemType(type: string): LiveActivityKind {
  switch (type) {
    case 'agentMessage':
      return 'writing'
    case 'reasoning':
    case 'reasoningContent':
      return 'thinking'
    case 'commandExecution':
      return 'command'
    case 'toolCall':
      return 'tool'
    default:
      return 'working'
  }
}

/**
 * Collapse streamed agent text to a single trailing line for the status tail.
 * Returns null when there is no human-readable text to show.
 */
export function liveActivityTail(text: unknown): string | null {
  if (typeof text !== 'string') {
    return null
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const last = lines.length > 0 ? lines[lines.length - 1] : ''
  const collapsed = last.replace(/\s+/g, ' ').trim()
  if (!collapsed) {
    return null
  }

  return collapsed.length > TAIL_MAX_LENGTH ? `${collapsed.slice(0, TAIL_MAX_LENGTH - 1)}…` : collapsed
}

/**
 * Fold a single drawer stream event into the current live activity for the
 * focused run. Terminal run status clears it; item events replace it in place.
 */
export function reduceLiveActivity(prev: LiveActivity | null, event: DrawerStreamEvent): LiveActivity | null {
  switch (event.type) {
    case 'drawer/run/status': {
      const status = (event.payload as RunSummary | undefined)?.status
      if (typeof status === 'string' && TERMINAL_RUN_STATUSES.has(status)) {
        return null
      }
      return prev
    }
    case 'drawer/item.started':
    case 'drawer/item.delta': {
      const item = event.payload as ConversationItem | undefined
      if (!item || typeof item.type !== 'string') {
        return prev
      }

      const kind = activityKindForItemType(item.type)
      const tail =
        kind === 'writing' || kind === 'thinking'
          ? liveActivityTail((item.payload as { text?: unknown } | undefined)?.text)
          : null
      return { runId: event.runId, kind, tail }
    }
    default:
      return prev
  }
}
