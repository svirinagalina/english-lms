// Phones and tablets: a coarse pointer, or the iPad's desktop-mode Safari.
export const isMobile = () =>
  (typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))) ||
  (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 900)
