'use client'

import { useEffect, useMemo, useRef } from 'react'

type Star = {
  x: number
  y: number
  size: number
  alpha: number
  twinkleSpeed: number
  twinklePhase: number
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
  starCount = 120,
  letterCount = 20,
  onReady,
  onError,
}: {
  className?: string
  starCount?: number
  letterCount?: number
  onReady?: () => void
  onError?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const readyRef = useRef(false)
  const timeRef = useRef(0)

  // Smooth parallax state
  const mouseTarget = useRef({ x: 0, y: 0 })
  const mouseCurrent = useRef({ x: 0, y: 0 })
  const scrollY = useRef(0)

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  }, [])

  useEffect(() => {
    try {
      const canvas = canvasRef.current
      if (!canvas) {
        onError?.()
        return
      }

      const ctx = canvas.getContext('2d', { alpha: true })
      if (!ctx) {
        onError?.()
        return
      }

      if (!readyRef.current) {
        readyRef.current = true
        onReady?.()
      }

      let w = 0
      let h = 0
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      const stars: Star[] = []
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

        // Initialize stars
        stars.length = 0
        for (let i = 0; i < starCount; i++) {
          const depth = rand(0.2, 1.0)
          stars.push({
            x: rand(0, w),
            y: rand(0, h),
            size: rand(0.5, 2.0) * depth,
            alpha: rand(0.2, 0.7) * depth,
            twinkleSpeed: rand(0.0001, 0.0008), // SLOWER twinkle
            twinklePhase: rand(0, Math.PI * 2),
            depth,
          })
        }

        // Initialize letters - gentle drift
        letters.length = 0
        for (let i = 0; i < letterCount; i++) {
          const depth = rand(0.3, 1.0)
          letters.push({
            x: rand(0, w),
            y: rand(0, h),
            ch: LETTERS[Math.floor(rand(0, LETTERS.length))],
            size: rand(14, 28) * (0.6 + depth * 0.4),
            // ULTRA slow drift - barely moving
            vx: rand(-0.003, 0.003) * depth,
            vy: rand(-0.002, 0.004) * depth,
            alpha: rand(0.03, 0.08) * (0.7 + depth * 0.3),
            depth,
            rot: rand(-Math.PI / 12, Math.PI / 12), // Even less rotation
            rotV: rand(-0.0001, 0.0001) * depth, // ULTRA slow rotation
          })
        }
      }

      const onMouseMove = (e: MouseEvent) => {
        const parent = canvas.parentElement
        if (!parent) return
        const rect = parent.getBoundingClientRect()
        const mx = (e.clientX - rect.left) / rect.width
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
        timeRef.current += 1

        // Gentle parallax easing
        const ease = prefersReducedMotion ? 0.02 : 0.04
        mouseCurrent.current.x += (mouseTarget.current.x - mouseCurrent.current.x) * ease
        mouseCurrent.current.y += (mouseTarget.current.y - mouseCurrent.current.y) * ease

        // Clear
        ctx.clearRect(0, 0, w, h)

        // Deep space gradient
        const g = ctx.createLinearGradient(0, 0, w, h)
        g.addColorStop(0, '#060A2A')
        g.addColorStop(0.4, '#0A0F3D')
        g.addColorStop(0.7, '#0F1454')
        g.addColorStop(1, '#1A1766')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)

        // Nebula glow - soft cosmic haze (MORE VISIBLE)
        ctx.globalAlpha = 0.35
        const g2 = ctx.createRadialGradient(
          w * 0.7,
          h * 0.3,
          0,
          w * 0.7,
          h * 0.3,
          Math.max(w, h) * 0.9
        )
        g2.addColorStop(0, 'rgba(248,151,254,0.45)') // soft pink - MORE VISIBLE
        g2.addColorStop(0.4, 'rgba(124,156,255,0.30)') // blue - MORE VISIBLE
        g2.addColorStop(0.7, 'rgba(123,106,244,0.18)') // purple - MORE VISIBLE
        g2.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g2
        ctx.fillRect(0, 0, w, h)

        // Secondary nebula (MORE VISIBLE)
        const g3 = ctx.createRadialGradient(
          w * 0.2,
          h * 0.7,
          0,
          w * 0.2,
          h * 0.7,
          Math.max(w, h) * 0.6
        )
        g3.addColorStop(0, 'rgba(124,156,255,0.25)')
        g3.addColorStop(0.5, 'rgba(123,106,244,0.15)')
        g3.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g3
        ctx.fillRect(0, 0, w, h)
        ctx.globalAlpha = 1

        const px = mouseCurrent.current.x
        const py = mouseCurrent.current.y
        const s = scrollY.current

        // Stars - distant and mostly static with subtle twinkle
        for (const star of stars) {
          // Very subtle parallax movement
          const ox = px * 4 * star.depth
          const oy = py * 3 * star.depth + s * 0.005 * star.depth

          // Twinkle effect
          const twinkle = Math.sin(timeRef.current * star.twinkleSpeed + star.twinklePhase)
          const alpha = star.alpha + twinkle * 0.15

          ctx.globalAlpha = clamp(alpha, 0, 1)
          ctx.beginPath()
          ctx.arc(star.x + ox, star.y + oy, star.size, 0, Math.PI * 2)
          ctx.fillStyle = '#EDEEFF'
          ctx.fill()
        }
        ctx.globalAlpha = 1

        // Letters - slow cosmic drift with gentle glow
        ctx.shadowColor = 'rgba(248,151,254,0.3)'
        ctx.shadowBlur = 8

        for (const letter of letters) {
          // Gentle drift motion
          const motionScale = prefersReducedMotion ? 0.3 : 1
          letter.x += letter.vx * motionScale
          letter.y += letter.vy * motionScale
          letter.rot += letter.rotV * motionScale

          // Wrap around edges with padding
          if (letter.y > h + 50) letter.y = -50
          if (letter.y < -50) letter.y = h + 50
          if (letter.x > w + 50) letter.x = -50
          if (letter.x < -50) letter.x = w + 50

          // Parallax offset
          const ox = px * 12 * letter.depth
          const oy = py * 8 * letter.depth + s * 0.008 * letter.depth

          ctx.save()
          ctx.translate(letter.x + ox, letter.y + oy)
          ctx.rotate(letter.rot)

          ctx.globalAlpha = clamp(letter.alpha, 0, 0.12)
          ctx.font = `600 ${Math.floor(
            letter.size
          )}px var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, monospace`
          ctx.fillStyle = '#B8B6D9' // soft lavender
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(letter.ch, 0, 0)

          ctx.restore()
        }

        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }

      resize()
      window.addEventListener('resize', resize)
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('mousemove', onMouseMove, { passive: true })
      window.addEventListener('mouseleave', onMouseLeave)

      rafRef.current = requestAnimationFrame(tick)

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        window.removeEventListener('resize', resize)
        window.removeEventListener('scroll', onScroll)
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseleave', onMouseLeave)
      }
    } catch (e) {
      onError?.()
      return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterCount, starCount, prefersReducedMotion, onReady, onError])

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true" />
    </div>
  )
}
