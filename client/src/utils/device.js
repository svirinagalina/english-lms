import { useEffect, useState } from 'react'

// True while the window is phone-width (matches the 720px CSS breakpoint).
export function useNarrow() {
  const query = '(max-width: 720px)'
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

// Phones and tablets: a coarse pointer, or the iPad's desktop-mode Safari.
export const isMobile = () =>
  (typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) ||
  (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 900)
