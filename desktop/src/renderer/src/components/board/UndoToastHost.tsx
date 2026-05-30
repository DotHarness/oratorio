import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type UndoToastEntry = {
  id: string
  label: string
  durationMs: number
  createdAt: number
  onUndo: () => void
  onCommit: () => void
}

export function UndoToastHost({ toasts }: { toasts: UndoToastEntry[] }) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const latestToast = toasts[toasts.length - 1]

  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        toast.onCommit()
      }, Math.max(0, toast.durationMs - (Date.now() - toast.createdAt))),
    )

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [toasts])

  useEffect(() => {
    if (!latestToast) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      const isUndoShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z'
      if (event.key === 'Escape' || isUndoShortcut) {
        event.preventDefault()
        latestToast.onUndo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [latestToast])

  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="undo-toast-region" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <UndoToast key={toast.id} toast={toast} prefersReducedMotion={prefersReducedMotion} />
      ))}
    </div>
  )
}

function UndoToast({ toast, prefersReducedMotion }: { toast: UndoToastEntry; prefersReducedMotion: boolean }) {
  const { t } = useTranslation('board')
  const remainingMs = useRemainingTime(toast)
  const progress = prefersReducedMotion ? 100 : Math.max(0, Math.min(100, (remainingMs / toast.durationMs) * 100))

  return (
    <div className="undo-toast" role="status">
      <span>{toast.label}</span>
      <button type="button" onClick={toast.onUndo}>
        {t('undo')}
      </button>
      <span
        className={`undo-toast-progress${prefersReducedMotion ? ' reduced-motion' : ''}`}
        style={{ transform: `scaleX(${progress / 100})` }}
        aria-hidden="true"
      />
    </div>
  )
}

function useRemainingTime(toast: UndoToastEntry) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [])

  return Math.max(0, toast.durationMs - (now - toast.createdAt))
}

function usePrefersReducedMotion() {
  const media = useMemo(() => (typeof window === 'undefined' ? null : window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null), [])
  const [matches, setMatches] = useState(() => media?.matches ?? false)

  useEffect(() => {
    if (!media) {
      return
    }

    const handleChange = () => setMatches(media.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [media])

  return matches
}
