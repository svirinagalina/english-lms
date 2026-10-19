import { useEffect, useRef } from 'react'
import '../styles/landing-footer.css'

// The IELTS / TOEFL landing's footer: link columns over a living landscape of
// contour lines (pink on the brand green, little cream trees) that slowly
// breathes and rises into a hill under the pointer. Drawn on a canvas; paused
// off screen; still with reduced motion.

const ROWS = 34
const TREES = 70

// Smooth pseudo-noise: a few sines, enough for soft hills.
const hills = (x, z, t) =>
  Math.sin(x * 2.1 + z * 1.3 + t * 0.25) * 0.5 +
  Math.sin(x * 4.7 - z * 2.2 + t * 0.18) * 0.22 +
  Math.sin(x * 9.3 + z * 3.1 - t * 0.31) * 0.08 +
  Math.exp(-((x - 0.55) ** 2) / 0.025) * 1.1 + // the big mountain
  Math.exp(-((x - 0.28) ** 2) / 0.012) * 0.6

function Terrain() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let raf = 0
    let visible = true
    const mouse = { x: -1, y: -1, s: 0 } // s eases the hill in and out
    // Trees: fixed spots in the front rows.
    let seed = 7
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    const trees = Array.from({ length: TREES }, () => ({ x: rnd(), row: Math.floor(ROWS * 0.45 + rnd() * ROWS * 0.53), s: 0.6 + rnd() * 0.7 }))

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width; h = r.height
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const yAt = (row, x, t) => {
      const z = row / (ROWS - 1) // 0 = far, 1 = near
      const base = h * (0.42 + z * 0.56)
      const amp = h * (0.3 - z * 0.24)
      // Mountains rise in the middle and flatten towards the edges.
      let lift = hills(x, z * 3, t) * amp * (0.3 + 0.7 * Math.sin(Math.PI * x))
      if (mouse.s > 0.01) {
        const dx = (x * w - mouse.x) / (w * 0.09)
        const dy = (base - mouse.y) / (h * 0.45)
        lift += Math.exp(-(dx * dx + dy * dy)) * h * 0.22 * mouse.s
      }
      return base - lift
    }
    const draw = (time) => {
      const t = still ? 0 : time / 1000
      mouse.s += ((mouse.x >= 0 ? 1 : 0) - mouse.s) * 0.06
      ctx.clearRect(0, 0, w, h)
      const step = Math.max(4, w / 260)
      for (let row = 0; row < ROWS; row++) {
        const z = row / (ROWS - 1)
        ctx.beginPath()
        for (let px = 0; px <= w + step; px += step) {
          const y = yAt(row, px / w, t)
          if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y)
        }
        // Hide the rows behind this one, then draw the line.
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
        ctx.fillStyle = '#14453f'
        ctx.fill()
        ctx.strokeStyle = `rgba(255, 213, 237, ${0.18 + z * 0.55})`
        ctx.lineWidth = 0.8 + z * 0.6
        ctx.stroke()
        for (const tr of trees) {
          if (tr.row !== row) continue
          const x = tr.x * w
          const y = yAt(row, tr.x, t)
          const s = (3 + z * 5) * tr.s
          ctx.beginPath()
          ctx.moveTo(x, y - s * 2.1); ctx.lineTo(x + s * 0.75, y); ctx.lineTo(x - s * 0.75, y); ctx.closePath()
          ctx.fillStyle = `rgba(252, 251, 246, ${0.35 + z * 0.55})`
          ctx.fill()
        }
      }
      if (!still && visible) raf = requestAnimationFrame(draw)
    }

    resize()
    draw(0)
    const ro = new ResizeObserver(() => { resize(); if (still) draw(0) })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      cancelAnimationFrame(raf)
      if (visible && !still) raf = requestAnimationFrame(draw)
    })
    io.observe(canvas)
    const host = canvas.parentElement
    const move = (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top }
    const leave = () => { mouse.x = -1; mouse.y = -1 }
    if (!still) { host.addEventListener('pointermove', move); host.addEventListener('pointerleave', leave) }
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave) }
  }, [])
  return <canvas ref={ref} className="lf-terrain" aria-hidden="true" />
}

export default function LandingFooter({ exam, onExam, site, telegram, instagram }) {
  const go = (key) => (e) => { e.preventDefault(); onExam(key); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  return (
    <footer className="lf">
      <div className="lf-top iel-wrap">
        <div className="lf-brand">
          <img src="/ielts/logo.svg" alt="Advent Academy" />
          <p>Подготовка к IELTS и TOEFL с преподавателями уровня C2 — на собственной платформе.</p>
          <button type="button" className="lf-up" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Наверх ↑</button>
        </div>
        <nav className="lf-col" aria-label="Курсы">
          <h3>Курсы</h3>
          <a href="/ielts" className={exam === 'ielts' ? 'on' : ''} onClick={go('ielts')}>Подготовка к IELTS</a>
          <a href="/ielts?exam=toefl" className={exam === 'toefl' ? 'on' : ''} onClick={go('toefl')}>TOEFL iBT 2026</a>
          <a href={site}>Общий английский ↗</a>
          <a href={site}>Учебник EnglishTime ↗</a>
        </nav>
        <nav className="lf-col" aria-label="Эта страница">
          <h3>Курс</h3>
          <a href="#try">Попробовать задание</a>
          <a href="#teachers">Преподаватели</a>
          <a href="#lessons">Как проходят занятия</a>
          <a href="#tariffs">Тарифы</a>
        </nav>
        <nav className="lf-col" aria-label="Ещё">
          <h3>Ученикам</h3>
          <a href="#reviews">Отзывы</a>
          <a href="#faq">Вопросы</a>
          <a href="/login">Войти на платформу</a>
          <a href="#contact">Оставить заявку</a>
        </nav>
        <nav className="lf-col" aria-label="Контакты">
          <h3>Контакты</h3>
          <a href={telegram} target="_blank" rel="noopener noreferrer">Telegram ↗</a>
          <a href={instagram} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
          <a href="/privacy.html">Политика конфиденциальности</a>
        </nav>
      </div>
      <div className="lf-bottom iel-wrap">
        <span>© {new Date().getFullYear()} Advent Academy · Сделано с любовью к английскому.</span>
        <span className="lf-flags">IELTS · TOEFL · English</span>
      </div>
      <div className="lf-land"><Terrain /></div>
    </footer>
  )
}
