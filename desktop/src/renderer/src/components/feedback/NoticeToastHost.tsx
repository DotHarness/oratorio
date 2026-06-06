import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import type { NoticeEntry } from '../../lib/types'

const STACK_GAP_PX = 10
const COLLAPSED_PEEK_PX = 10
const COLLAPSED_SCALE_STEP = 0.04
const COLLAPSED_OPACITY_STEP = 0.16
const COLLAPSED_VISIBLE_DEPTH = 3
const ENTER_OFFSET_PX = 28
const EXIT_OFFSET_PX = 16
const EXIT_DURATION_MS = 200
const ESTIMATED_CARD_HEIGHT_PX = 60

const noticeIconByTone: Record<NoticeEntry['tone'], LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  error: TriangleAlert,
}

/**
 * Stacked notice toasts pinned to the top-right of the shell. Newest sits in
 * front; older ones fan behind with reduced scale/opacity and expand into a
 * vertical list on hover/focus. Each card auto-dismisses on a pausable timer
 * (paused while the stack is expanded) and shows a shrinking progress bar.
 * Mirrors the DotCraft desktop toast system, adapted to Oratorio tokens.
 */
export function NoticeToastHost({
  notices,
  onDismiss,
}: {
  notices: NoticeEntry[]
  onDismiss: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const heightsRef = useRef<Map<string, number>>(new Map())
  const [, forceRender] = useState(0)

  const setCardHeight = useCallback((id: string, height: number) => {
    const previous = heightsRef.current.get(id)
    if (previous === height) {
      return
    }
    heightsRef.current.set(id, height)
    forceRender((tick) => tick + 1)
  }, [])

  // Newest first so it visually sits on top of the fanned stack.
  const ordered = [...notices].reverse()
  const heights = ordered.map((notice) => heightsRef.current.get(notice.id) ?? ESTIMATED_CARD_HEIGHT_PX)

  const expandedTops: number[] = []
  let runningTop = 0
  for (let index = 0; index < ordered.length; index += 1) {
    expandedTops.push(runningTop)
    runningTop += heights[index] + STACK_GAP_PX
  }

  const containerHeight = ordered.length === 0
    ? 0
    : expanded
      ? Math.max(0, runningTop - STACK_GAP_PX)
      : (heights[0] ?? 0) + Math.min(Math.max(0, ordered.length - 1), COLLAPSED_VISIBLE_DEPTH) * COLLAPSED_PEEK_PX

  const collapse = useCallback(() => setExpanded(false), [])
  const expand = useCallback(() => setExpanded(true), [])

  return (
    <div
      className="ui-notice-region"
      aria-live="polite"
      aria-atomic="false"
      data-expanded={expanded ? 'true' : 'false'}
      onMouseEnter={expand}
      onMouseLeave={collapse}
      onFocus={expand}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          collapse()
        }
      }}
      style={{ height: `${containerHeight}px`, pointerEvents: ordered.length > 0 ? 'auto' : 'none' }}
    >
      {ordered.map((notice, index) => (
        <NoticeToastCard
          key={notice.id}
          notice={notice}
          index={index}
          expanded={expanded}
          expandedTop={expandedTops[index]}
          onMeasure={setCardHeight}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}

function NoticeToastCard({
  notice,
  index,
  expanded,
  expandedTop,
  onMeasure,
  onDismiss,
}: {
  notice: NoticeEntry
  index: number
  expanded: boolean
  expandedTop: number
  onMeasure: (id: string, height: number) => void
  onDismiss: (id: string) => void
}) {
  const { t } = useTranslation()
  const reduceMotion = usePrefersReducedMotion()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [entered, setEntered] = useState(reduceMotion)
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)

  const remainingRef = useRef(notice.durationMs)
  const startedAtRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)

  const paused = expanded
  const Icon = noticeIconByTone[notice.tone]

  const dismiss = useCallback(() => {
    if (leavingRef.current) {
      return
    }
    leavingRef.current = true
    setLeaving(true)
    window.setTimeout(() => onDismiss(notice.id), reduceMotion ? 0 : EXIT_DURATION_MS)
  }, [notice.id, onDismiss, reduceMotion])

  const activate = useCallback(() => {
    notice.onAction?.()
    dismiss()
  }, [dismiss, notice])

  // Pausable auto-dismiss timer: it stops while the stack is expanded and
  // resumes from the remaining time once the pointer leaves.
  useEffect(() => {
    if (notice.durationMs <= 0 || leaving) {
      return
    }

    const clear = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    if (paused) {
      if (startedAtRef.current !== null) {
        remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current))
        startedAtRef.current = null
      }
      clear()
      return
    }

    startedAtRef.current = Date.now()
    timerRef.current = window.setTimeout(dismiss, remainingRef.current)
    return clear
  }, [paused, leaving, dismiss, notice.durationMs])

  // Measure the rendered height so the expanded stack lays out exactly.
  useLayoutEffect(() => {
    const element = cardRef.current
    if (!element) {
      return
    }

    onMeasure(notice.id, element.getBoundingClientRect().height)
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        onMeasure(notice.id, entry.contentRect.height)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [notice.id, onMeasure])

  // Trigger the enter transition on the frame after mount.
  useEffect(() => {
    if (reduceMotion) {
      setEntered(true)
      return
    }
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [reduceMotion])

  const collapsedHidden = !expanded && index > COLLAPSED_VISIBLE_DEPTH
  const targetY = expanded ? expandedTop : index * COLLAPSED_PEEK_PX
  const targetScale = expanded ? 1 : Math.max(0, 1 - index * COLLAPSED_SCALE_STEP)
  const targetOpacity = leaving
    ? 0
    : !entered
      ? 0
      : expanded
        ? 1
        : collapsedHidden
          ? 0
          : Math.max(0, 1 - index * COLLAPSED_OPACITY_STEP)
  const enterOffset = !entered ? ENTER_OFFSET_PX : leaving ? EXIT_OFFSET_PX : 0

  const cardStyle: CSSProperties = {
    transform: `translateY(${targetY}px) translateX(${enterOffset}px) scale(${targetScale})`,
    opacity: targetOpacity,
    zIndex: 1000 - index,
    transition: reduceMotion
      ? 'none'
      : 'transform 360ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease-out',
    pointerEvents: !expanded && index > 0 ? 'none' : 'auto',
  }

  const content = (
    <>
      <span className="ui-notice-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <span className="ui-notice-content">
        <span className="ui-notice-message">{notice.message}</span>
        {notice.actionLabel ? <span className="ui-notice-action">{notice.actionLabel}</span> : null}
      </span>
    </>
  )

  const progress = notice.durationMs > 0 && !reduceMotion ? (
    <span className="ui-notice-progress" aria-hidden="true">
      <span
        className="ui-notice-progress-fill"
        style={{ animationDuration: `${notice.durationMs}ms`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </span>
  ) : null

  return (
    <div ref={cardRef} className="ui-notice-card" role="status" style={cardStyle}>
      {notice.onAction ? (
        <button
          type="button"
          className={`ui-notice ${notice.tone} actionable`}
          onClick={activate}
          aria-label={notice.actionLabel ? `${notice.message} ${notice.actionLabel}` : notice.message}
        >
          {content}
          {progress}
        </button>
      ) : (
        <div className={`ui-notice ${notice.tone}`}>
          {content}
          <button
            type="button"
            className="ui-notice-close"
            aria-label={t('common:shell.notices.dismiss')}
            onClick={dismiss}
          >
            <X size={14} aria-hidden="true" />
          </button>
          {progress}
        </div>
      )}
    </div>
  )
}
