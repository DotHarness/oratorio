import { useEffect, useMemo, useState } from 'react'

/**
 * Tracks the `prefers-reduced-motion: reduce` media query so animated surfaces
 * (toasts, undo banners) can fall back to static rendering. Returns false in
 * environments without `matchMedia` (e.g. SSR / jsdom without a polyfill).
 */
export function usePrefersReducedMotion(): boolean {
  const media = useMemo(
    () => (typeof window === 'undefined' ? null : window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null),
    [],
  )
  const [matches, setMatches] = useState(() => media?.matches ?? false)

  useEffect(() => {
    if (!media) {
      return
    }

    const handleChange = () => setMatches(media.matches)
    handleChange()
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [media])

  return matches
}
