import { useEffect, useRef, useState } from 'react'

// The little plane on the IELTS / TOEFL hero: it takes off by Galina's photo
// and flies along a dashed trail to the Harvard polaroid, drawing the trail
// behind it. Plays on load and again when the photo is hovered. Only in the
// wide layout where the polaroid sits to the right of the photo; otherwise
// (and with reduced motion) the original static trail picture stays.

const PLANE = 'M2 11h8l4-8h2.5l-2 8H20l2-2.5h1.5l-1 3.5 1 3.5H22L20 13h-5.5l2 8H14l-4-8H2z' // nose at the left

export default function HeroFlight({ heroRef, avatarRef, targetRef, replay }) {
  const [geo, setGeo] = useState(null)
  const pathRef = useRef(null)
  const maskRef = useRef(null)
  const planeRef = useRef(null)
  const rafRef = useRef(0)
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Where the photo and the polaroid are, relative to the hero.
  useEffect(() => {
    const measure = () => {
      const hero = heroRef.current?.getBoundingClientRect()
      const a = avatarRef.current?.getBoundingClientRect()
      const t = targetRef.current?.getBoundingClientRect()
      if (!hero || !a || !t) return setGeo(null)
      // The photo is still popping in: measure once it has settled.
      if (avatarRef.current.getAnimations?.().some((x) => x.playState === 'running')) return undefined
      const start = { x: a.right - hero.left + 4, y: a.top - hero.top + a.height * 0.45 }
      const end = { x: t.left - hero.left + 6, y: t.top - hero.top + t.height * 0.32 }
      if (end.x - start.x < 240) return setGeo(null) // stacked (phone) layout
      const dx = end.x - start.x
      // A climb, a little loop over the photo, then a long glide to the polaroid.
      const d = `M ${start.x} ${start.y}
        C ${start.x + dx * 0.10} ${start.y - 70}, ${start.x + dx * 0.24} ${start.y - 40}, ${start.x + dx * 0.22} ${start.y + 6}
        C ${start.x + dx * 0.20} ${start.y + 40}, ${start.x + dx * 0.12} ${start.y + 10}, ${start.x + dx * 0.20} ${start.y - 30}
        C ${start.x + dx * 0.38} ${start.y - 120}, ${end.x - dx * 0.25} ${end.y - 30}, ${end.x} ${end.y}`
      setGeo({ d, w: hero.width, h: hero.height })
    }
    measure()
    const later = setTimeout(measure, 900) // after the photo's pop-in
    const ro = new ResizeObserver(measure)
    if (heroRef.current) ro.observe(heroRef.current)
    return () => { clearTimeout(later); ro.disconnect() }
  }, [heroRef, avatarRef, targetRef])

  // Fly: the plane follows the path, the trail is revealed behind it.
  useEffect(() => {
    const path = pathRef.current
    if (!geo || !path) return undefined
    const len = path.getTotalLength()
    const place = (p) => {
      const at = path.getPointAtLength(len * p)
      const ahead = path.getPointAtLength(Math.min(len, len * p + 1))
      const back = path.getPointAtLength(Math.max(0, len * p - 1))
      const angle = Math.atan2(ahead.y - back.y, ahead.x - back.x) * 180 / Math.PI
      planeRef.current?.setAttribute('transform', `translate(${at.x} ${at.y}) rotate(${angle + 180}) scale(1.35) translate(-12 -12)`)
      maskRef.current?.setAttribute('stroke-dashoffset', String(len * (1 - p)))
    }
    maskRef.current?.setAttribute('stroke-dasharray', String(len))
    if (still) { place(1); return undefined }
    const duration = 3400
    const begin = performance.now() + 500 // after the hero has appeared
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
    const tick = (now) => {
      const x = Math.min(1, Math.max(0, (now - begin) / duration))
      place(ease(x))
      if (x < 1) rafRef.current = requestAnimationFrame(tick)
    }
    place(0)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [geo, replay, still])

  if (!geo) return null
  return (
    <svg className="iel-flight" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
      <defs>
        <mask id="iel-flight-mask" maskUnits="userSpaceOnUse">
          <path ref={maskRef} d={geo.d} fill="none" stroke="#fff" strokeWidth="8" />
        </mask>
      </defs>
      <path ref={pathRef} d={geo.d} fill="none" stroke="#fcfbf6" strokeWidth="1.5" strokeDasharray="5 6" strokeLinecap="round" mask="url(#iel-flight-mask)" />
      <path ref={planeRef} d={PLANE} fill="#fcfbf6" stroke="#14453f" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}
