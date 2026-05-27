import type { BoardStreamEvent, BoardStreamStatus } from './types'

export type BoardStreamControlFrame =
  | { type: 'focus'; runId: string }
  | { type: 'unfocus'; runId: string }
  | { type: 'ping' }

type BoardStreamOptions = {
  serverBaseUrl: string
  onEvent: (event: BoardStreamEvent) => void
  onStatus: (status: BoardStreamStatus) => void
}

export function createBoardStream({ serverBaseUrl, onEvent, onStatus }: BoardStreamOptions) {
  let socket: WebSocket | null = null
  let closed = false
  let reconnectTimer: number | null = null
  let heartbeatTimer: number | null = null
  let reconnectAttempt = 0
  const queuedFrames: BoardStreamControlFrame[] = []

  function connect() {
    if (closed || typeof WebSocket === 'undefined') {
      return
    }

    onStatus('connecting')
    socket = new WebSocket(boardStreamUrl(serverBaseUrl))

    socket.addEventListener('open', () => {
      reconnectAttempt = 0
      onStatus('connected')
      flushQueuedFrames()
      heartbeatTimer = window.setInterval(() => {
        send({ type: 'ping' })
      }, 25000)
    })

    socket.addEventListener('message', (message) => {
      try {
        const event = JSON.parse(String(message.data)) as BoardStreamEvent
        onEvent(event)
      } catch {
        // Ignore malformed frames; reconnect is handled by close/error events.
      }
    })

    socket.addEventListener('close', scheduleReconnect)
    socket.addEventListener('error', scheduleReconnect)
  }

  function scheduleReconnect() {
    if (closed) {
      return
    }

    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }

    onStatus('disconnected')
    if (reconnectTimer !== null) {
      return
    }

    const delay = Math.min(16000, 1000 * 2 ** reconnectAttempt)
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function send(frame: BoardStreamControlFrame) {
    if (closed) {
      return
    }

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(frame))
      return
    }

    queuedFrames.push(frame)
  }

  function flushQueuedFrames() {
    while (queuedFrames.length > 0 && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(queuedFrames.shift()))
    }
  }

  function close() {
    closed = true
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
    }
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer)
    }
    socket?.close()
  }

  connect()

  return { close, send }
}

function boardStreamUrl(serverBaseUrl: string) {
  const fallbackOrigin = window.location.origin === 'null' ? 'http://127.0.0.1' : window.location.origin
  const url = new URL('/api/v1/stream', serverBaseUrl || fallbackOrigin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
