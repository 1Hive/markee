'use client'

import { useEffect, useMemo, useRef } from 'react'

type Particle = {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  alpha: number
  depth: number
}

type Letter = {
  x: number
  y: number
  ch: string
  size: number
  vx: number
  vy: number
  alpha: number
  depth: number
  rot: number
  rotV: number
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function HeroBackground({
  className = '',
  starCount = 140,
  letterCount = 26,
}: {
  className?: string
  starCount?: number
  letterCount?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  // Smooth parallax state (mutable refs so we don’t re-render)
  const mouseTarget = useRef({ x: 0, y: 0 })
  const mouseCurrent = useRef({ x: 0, y: 0 })
  const scrollY = useRef(0)

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const stars: Particle[] = []
    const letters: Letter[] = []

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()
      w = Math.max(1, Math.floor(rect.width))
      h = Math.max(1, Math.floor(rect.height))

      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Re-seed on resize (keeps it clean)
      stars.length = 0
      letters.length = 0

      for (let i = 0; i < starCount; i++) {
        const depth = rand(0.15, 1.0) // smaller = farther
        stars.push({
          x: rand(0, w),
          y: rand(0, h),
          r: rand(0.4, 1.4) * (0.6 + depth),
          vx: rand(-0.01, 0.01) * depth,
          vy: rand(0.01, 0.05) * depth,
          alpha: rand(0.06, 0.18) * (0.5 + depth),
          depth,
        })
      }

      for (let i = 0; i < letterCount; i++) {
        const depth = rand(0.25, 1.0) // letters tend to be closer
        letters.push({
          x: rand(0, w),
          y: rand(0, h),
          ch: LETTERS[Math.floor(rand(0, LETTERS.length))],
          size: rand(10, 22) * (0.7 + depth),
          vx: rand(-0.04, 0.04) * depth,
          vy: rand(-0.02, 0.06) * depth,
          alpha: rand(0.04, 0.10) * (0.6 + depth), // DIM so it won’t distract
          depth,
          rot: rand(-Math.PI, Math.PI),
          rotV: rand(-0.0012, 0.0012) * depth,
        })
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / rect.width // 0..1
      const my = (e.clientY - rect.top) / rect.height
      mouseTarget.current.x = (mx - 0.5) * 2
      mouseTarget.current.y = (my - 0.5) * 2
    }

    const onMouseLeave = () => {
      mouseTarget.current.x = 0
      mouseTarget.current.y = 0
    }

    const onScroll = () => {
      scrollY.current = window.scrollY || 0
    }

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)

      // Ease parallax
      const ease = prefersReducedMotion ? 0.05 : 0.08
      mouseCurrent.current.x += (mouseTarget.current.x - mouseCurrent.current.x) * ease
      mouseCurrent.current.y += (mouseTarget.current.y - mouseCurrent.current.y) * ease

      // Clear
      ctx.clearRect(0, 0, w, h)

      // Background gradient (deep space)
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#060A2A')
      g.addColorStop(0.45, '#0A0F3D')
      g.addColorStop(1, '#0F1B6B')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      // Subtle bloom / nebula haze
      ctx.globalAlpha = 0.18
      const g2 = ctx.createRadialGradient(
        w * 0.65,
        h * 0.35,
        0,
        w * 0.65,
        h * 0.35,
        Math.max(w, h) * 0.8
      )
      g2.addColorStop(0, 'rgba(248,151,254,0.20)') // soft-pink
      g2.addColorStop(0.55, 'rgba(123,106,244,0.10)') // amethyst-ish
      g2.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1

      // Parallax offsets
      const px = mouseCurrent.current.x
      const py = mouseCurrent.current.y
      const s = scrollY.current

      // Stars
      for (const st of stars) {
        st.y += st.vy * (prefersReducedMotion ? 0.6 : 1)
        st.x += st.vx * (prefersReducedMotion ? 0.6 : 1)

        if (st.y > h + 4) st.y = -4
        if (st.x > w + 4) st.x = -4
        if (st.x < -4) st.x = w + 4

        const ox = px * 10 * st.depth
        const oy = py * 6 * st.depth + s * 0.01 * st.depth

        ctx.globalAlpha = st.alpha
        ctx.beginPath()
        ctx.arc(st.x + ox, st.y + oy, st.r, 0, Math.PI * 2)
        ctx.fillStyle = '#EDEEFF' // soft-white
        ctx.fill()
      }

      // Letters (dim, slightly blurred vibe via shadow)
      ctx.shadowColor = 'rgba(248,151,254,0.20)'
      ctx.shadowBlur = 6

      for (const L of letters) {
        L.x += L.vx * (prefersReducedMotion ? 0.6 : 1)
        L.y += L.vy * (prefersReducedMotion ? 0.6 : 1)
        L.rot += L.rotV * (prefersReducedMotion ? 0.6 : 1)

        if (L.y > h + 40) L.y = -40
        if (L.x > w + 40) L.x = -40
        if (L.x < -40) L.x = w + 40

        const ox = px * 18 * L.depth
        const oy = py * 12 * L.depth + s * 0.02 * L.depth

        ctx.save()
        ctx.translate(L.x + ox, L.y + oy)
        ctx.rotate(L.rot)

        ctx.globalAlpha = clamp(L.alpha, 0, 0.12)
        ctx.font = `${Math.floor(
          L.size
        )}px var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
        ctx.fillStyle = 'rgba(184,182,217,1)' // lavender-gray
        ctx.fillText(L.ch, 0, 0)

        ctx.restore()
      }

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterCount, starCount, prefersReducedMotion])

  return (
    <div className={`absolute inset-0 -z-0 overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {/* Optional dim overlay to keep content readable */}
      <div className="absolute inset-0 bg-[#060A2A]/35" aria-hidden="true" />
    </div>
  )
}
