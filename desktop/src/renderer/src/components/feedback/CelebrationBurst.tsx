import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

type CelebrationBurstProps = {
  origin: { x: number; y: number } | null
}

const particleVectors = [
  [-48, -52],
  [-30, -72],
  [-8, -58],
  [18, -78],
  [42, -54],
  [54, -20],
  [34, 12],
  [8, 28],
  [-22, 18],
  [-50, -6],
  [-62, -34],
  [0, -94],
]

export function CelebrationBurst({ origin }: CelebrationBurstProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const particleStyles = useMemo(
    () =>
      particleVectors.map(([x, y], index) => ({
        '--burst-x': `${x}px`,
        '--burst-y': `${y}px`,
        '--burst-delay': `${index * 24}ms`,
      }) as CSSProperties),
    [],
  )

  if (!origin) {
    return null
  }

  if (prefersReducedMotion) {
    return (
      <div
        className="celebration-burst celebration-burst--reduced"
        style={{ left: origin.x, top: origin.y }}
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="celebration-burst" style={{ left: origin.x, top: origin.y }} aria-hidden="true">
      {particleStyles.map((style, index) => (
        <span className="celebration-particle" style={style} key={index} />
      ))}
    </div>
  )
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) {
      return
    }

    setPrefersReducedMotion(media.matches)
    const handleChange = () => setPrefersReducedMotion(media.matches)
    media.addEventListener?.('change', handleChange)
    return () => media.removeEventListener?.('change', handleChange)
  }, [])

  return prefersReducedMotion
}
