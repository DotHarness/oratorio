import {
  cloneElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'

type TooltipPlacement = 'top' | 'bottom'

type TooltipPosition = {
  arrowLeft: number
  left: number
  placement: TooltipPlacement
  top: number
}

type TooltipTriggerProps = {
  'aria-describedby'?: string
  onBlur?: FocusEventHandler<HTMLElement>
  onFocus?: FocusEventHandler<HTMLElement>
  onKeyDown?: KeyboardEventHandler<HTMLElement>
  onPointerEnter?: PointerEventHandler<HTMLElement>
  onPointerLeave?: PointerEventHandler<HTMLElement>
}

type TooltipProps = {
  content: string
  children: ReactElement<TooltipTriggerProps>
}

export function Tooltip({ content, children }: TooltipProps) {
  const id = useId()
  const triggerRef = useRef<HTMLElement | null>(null)
  const bubbleRef = useRef<HTMLSpanElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [portalRoot, setPortalRoot] = useState<Element | null>(null)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' ')

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const bubble = bubbleRef.current
    if (!trigger || !bubble || typeof window === 'undefined') {
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const bubbleRect = bubble.getBoundingClientRect()
    const width = bubbleRect.width || bubble.offsetWidth || 1
    const height = bubbleRect.height || bubble.offsetHeight || 1
    const gap = 8
    const viewportMargin = 8
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const availableAbove = triggerRect.top - viewportMargin
    const availableBelow = viewportHeight - triggerRect.bottom - viewportMargin
    const placement: TooltipPlacement = availableAbove >= height + gap || availableAbove > availableBelow ? 'top' : 'bottom'
    const triggerCenter = triggerRect.left + triggerRect.width / 2
    const unclampedLeft = triggerCenter - width / 2
    const maxLeft = Math.max(viewportMargin, viewportWidth - width - viewportMargin)
    const left = clamp(unclampedLeft, viewportMargin, maxLeft)
    const top =
      placement === 'top'
        ? Math.max(viewportMargin, triggerRect.top - height - gap)
        : Math.min(viewportHeight - height - viewportMargin, triggerRect.bottom + gap)
    const arrowLeft = clamp(triggerCenter - left, 12, Math.max(12, width - 12))

    setPosition({ arrowLeft, left, placement, top })
  }, [])

  const openTooltip = (trigger: HTMLElement) => {
    triggerRef.current = trigger
    setPortalRoot(trigger?.closest('.oratorio-desktop-frame, .app-shell') ?? document.body)
    setPosition(null)
    setIsOpen(true)
  }

  const closeTooltip = () => {
    setIsOpen(false)
    setPosition(null)
  }

  const handlePointerEnter: PointerEventHandler<HTMLElement> = (event) => {
    children.props.onPointerEnter?.(event)
    openTooltip(event.currentTarget)
  }

  const handlePointerLeave: PointerEventHandler<HTMLElement> = (event) => {
    children.props.onPointerLeave?.(event)
    closeTooltip()
  }

  const handleFocus: FocusEventHandler<HTMLElement> = (event) => {
    children.props.onFocus?.(event)
    openTooltip(event.currentTarget)
  }

  const handleBlur: FocusEventHandler<HTMLElement> = (event) => {
    children.props.onBlur?.(event)
    closeTooltip()
  }

  const handleKeyDown: KeyboardEventHandler<HTMLElement> = (event) => {
    children.props.onKeyDown?.(event)
    if (event.key === 'Escape') {
      closeTooltip()
    }
  }

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [content, isOpen, updatePosition])

  const tooltip = isOpen
    ? createPortal(
        <span
          className="ui-tooltip-bubble"
          data-placement={position?.placement ?? 'top'}
          id={id}
          ref={bubbleRef}
          role="tooltip"
          style={
            {
              '--tooltip-arrow-left': `${position?.arrowLeft ?? 0}px`,
              left: `${position?.left ?? -10000}px`,
              top: `${position?.top ?? -10000}px`,
              visibility: position ? 'visible' : 'hidden',
            } as CSSProperties
          }
        >
          {content}
        </span>,
        portalRoot ?? document.body,
      )
    : null

  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs -- Tooltip only injects event props; positioning refs are read in handlers/effects. */}
      {cloneElement(children, {
        'aria-describedby': describedBy,
        onBlur: handleBlur,
        onFocus: handleFocus,
        onKeyDown: handleKeyDown,
        onPointerEnter: handlePointerEnter,
        onPointerLeave: handlePointerLeave,
      })}
      {tooltip}
    </>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}
