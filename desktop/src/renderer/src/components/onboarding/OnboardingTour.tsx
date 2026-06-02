import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ExternalLink, X } from 'lucide-react'
import {
  onboardingImageBase,
  onboardingSteps,
  type OnboardingStep,
  type OnboardingStepPlacement,
} from '../../lib/onboarding'

type OnboardingTourProps = {
  /** Called when the tour is finished, skipped, or dismissed. The parent marks it seen. */
  onClose: () => void
}

type Rect = { top: number; left: number; width: number; height: number }

const SPOTLIGHT_PADDING = 6
const BUBBLE_GAP = 14
const VIEWPORT_MARGIN = 12

function rectsEqual(a: Rect | null, b: Rect): boolean {
  return a !== null && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

function computeBubblePosition(
  rect: Rect,
  placement: OnboardingStepPlacement,
  bubbleWidth: number,
  bubbleHeight: number,
): CSSProperties {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const centerX = rect.left + rect.width / 2 - bubbleWidth / 2
  const centerY = rect.top + rect.height / 2 - bubbleHeight / 2

  let top: number
  let left: number
  switch (placement) {
    case 'top':
      top = rect.top - BUBBLE_GAP - bubbleHeight
      left = centerX
      break
    case 'left':
      top = centerY
      left = rect.left - BUBBLE_GAP - bubbleWidth
      break
    case 'right':
      top = centerY
      left = rect.left + rect.width + BUBBLE_GAP
      break
    case 'bottom':
    default:
      top = rect.top + rect.height + BUBBLE_GAP
      left = centerX
      break
  }

  // Flip vertically if the preferred side overflows the viewport.
  if (placement === 'bottom' && top + bubbleHeight > viewportHeight - VIEWPORT_MARGIN) {
    top = rect.top - BUBBLE_GAP - bubbleHeight
  } else if (placement === 'top' && top < VIEWPORT_MARGIN) {
    top = rect.top + rect.height + BUBBLE_GAP
  }

  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - bubbleWidth - VIEWPORT_MARGIN)
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - bubbleHeight - VIEWPORT_MARGIN)
  return {
    top: Math.min(Math.max(top, VIEWPORT_MARGIN), maxTop),
    left: Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft),
  }
}

function OnboardingImage({ file, alt }: { file: string; alt: string }) {
  const { t } = useTranslation('onboarding')
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  return (
    <div className="onboarding-figure" data-status={status}>
      {status !== 'error' ? (
        <img
          src={`${onboardingImageBase}${file}`}
          alt={alt}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      ) : null}
      {status !== 'loaded' ? (
        <div className="onboarding-figure-fallback" aria-hidden={status === 'loading'}>
          {status === 'error' ? t('figureFallback') : null}
        </div>
      ) : null}
    </div>
  )
}

export function OnboardingTour({ onClose }: OnboardingTourProps) {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()
  const location = useLocation()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [targetMissing, setTargetMissing] = useState(false)
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties | undefined>(undefined)
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  const total = onboardingSteps.length
  const step: OnboardingStep = onboardingSteps[index]
  const isLast = index === total - 1
  const useSpotlight = Boolean(step.target) && !targetMissing && rect !== null

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const goBack = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1))
  }, [])

  const goNext = useCallback(() => {
    if (isLast) {
      handleClose()
      return
    }
    setIndex((current) => Math.min(total - 1, current + 1))
  }, [handleClose, isLast, total])

  // Measure (and keep aligned) the spotlight target for the current step.
  useEffect(() => {
    setRect(null)
    setTargetMissing(false)
    setBubbleStyle(undefined)

    const selector = step.target
    if (!selector) {
      return
    }

    if (step.route && !location.pathname.startsWith(step.route)) {
      navigate(step.route)
    }

    let cancelled = false
    let found = false
    const apply = () => {
      const element = document.querySelector(selector)
      if (!element) {
        return
      }
      found = true
      const box = element.getBoundingClientRect()
      const next: Rect = { top: box.top, left: box.left, width: box.width, height: box.height }
      setRect((previous) => (rectsEqual(previous, next) ? previous : next))
      setTargetMissing(false)
    }

    apply()
    const poll = window.setInterval(apply, 200)
    const failTimer = window.setTimeout(() => {
      if (!cancelled && !found) {
        setTargetMissing(true)
      }
    }, 1800)
    const onReflow = () => {
      if (!cancelled) {
        apply()
      }
    }
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)

    return () => {
      cancelled = true
      window.clearInterval(poll)
      window.clearTimeout(failTimer)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
    // Re-run only when the step changes; navigation/measurement is self-contained.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Position the bubble next to the spotlight once both are measured.
  useLayoutEffect(() => {
    if (!useSpotlight || !rect || !bubbleRef.current) {
      return
    }
    const box = bubbleRef.current.getBoundingClientRect()
    setBubbleStyle(computeBubblePosition(rect, step.placement ?? 'bottom', box.width, box.height))
  }, [useSpotlight, rect, index, step.placement])

  // Keyboard navigation.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault()
        goBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goBack, goNext, handleClose, index])

  useEffect(() => {
    bubbleRef.current?.focus()
  }, [index])

  const spotlightStyle: CSSProperties | undefined = useSpotlight && rect
    ? {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : undefined

  const provisionalBubbleStyle: CSSProperties | undefined = useSpotlight && rect
    ? { top: rect.top + rect.height + BUBBLE_GAP, left: Math.max(VIEWPORT_MARGIN, rect.left) }
    : undefined

  const title = t(`steps.${step.id}.title`)
  const body = t(`steps.${step.id}.body`)

  let ctaButton: ReactNode = null
  if (step.cta) {
    ctaButton = (
      <a className="secondary-button inline onboarding-cta" href={step.cta.target} target="_blank" rel="noreferrer">
        {t(`steps.${step.id}.cta`)}
        <ExternalLink size={14} />
      </a>
    )
  }

  const panel = (
    <div
      ref={bubbleRef}
      className={useSpotlight ? 'onboarding-bubble' : 'onboarding-card'}
      style={useSpotlight ? bubbleStyle ?? provisionalBubbleStyle : undefined}
      role="document"
      tabIndex={-1}
    >
      <header className="onboarding-head">
        <span className="eyebrow onboarding-eyebrow">{t('title')}</span>
        <div className="onboarding-head-actions">
          {!isLast ? (
            <button type="button" className="onboarding-skip" onClick={handleClose}>
              {t('controls.skip')}
            </button>
          ) : null}
          <button type="button" className="icon-button onboarding-close" aria-label={t('controls.close')} onClick={handleClose}>
            <X size={15} />
          </button>
        </div>
      </header>

      {step.image && !useSpotlight ? <OnboardingImage file={step.image} alt={title} /> : null}

      <div className="onboarding-copy">
        <h2 className="onboarding-title">{title}</h2>
        <p className="onboarding-body">{body}</p>
      </div>

      {ctaButton ? <div className="onboarding-cta-row">{ctaButton}</div> : null}

      <footer className="onboarding-foot">
        <div className="onboarding-progress">
          <div className="onboarding-dots" aria-hidden="true">
            {onboardingSteps.map((dotStep, dotIndex) => (
              <span
                key={dotStep.id}
                className={`onboarding-dot${dotIndex === index ? ' is-active' : ''}${dotIndex < index ? ' is-done' : ''}`}
              />
            ))}
          </div>
          <span className="onboarding-step-count">{t('controls.step', { current: index + 1, total })}</span>
        </div>
        <div className="onboarding-nav">
          {index > 0 ? (
            <button type="button" className="secondary-button inline onboarding-back" onClick={goBack}>
              <ChevronLeft size={15} />
              {t('controls.back')}
            </button>
          ) : null}
          <button type="button" className="primary-button inline onboarding-next" onClick={goNext}>
            {isLast ? t('controls.done') : t('controls.next')}
          </button>
        </div>
      </footer>
    </div>
  )

  return (
    <div
      className={`onboarding-overlay${useSpotlight ? ' is-spotlight' : ' is-card'}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('ariaLabel')}
    >
      {useSpotlight ? <div className="onboarding-spotlight" style={spotlightStyle} aria-hidden="true" /> : null}
      {panel}
    </div>
  )
}
