import { useCallback, useEffect, useRef } from 'react'
import { createBoardStream, type BoardStreamControlFrame } from '../lib/boardStream'
import type { BoardStreamEvent, BoardStreamStatus } from '../lib/types'

type UseBoardStreamOptions = {
  enabled: boolean
  serverBaseUrl: string
  onEvent: (event: BoardStreamEvent) => void
  onStatus: (status: BoardStreamStatus) => void
}

export function useBoardStream({ enabled, serverBaseUrl, onEvent, onStatus }: UseBoardStreamOptions) {
  const sendRef = useRef<((frame: BoardStreamControlFrame) => void) | null>(null)

  useEffect(() => {
    if (!enabled) {
      onStatus('disconnected')
      sendRef.current = null
      return
    }

    const stream = createBoardStream({ serverBaseUrl, onEvent, onStatus })
    sendRef.current = stream.send
    return () => {
      sendRef.current = null
      stream.close()
    }
  }, [enabled, serverBaseUrl, onEvent, onStatus])

  return useCallback((frame: BoardStreamControlFrame) => {
    sendRef.current?.(frame)
  }, [])
}
