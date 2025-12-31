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

    // Create particles
    const stars: Particle[] = []
    const letters: Letter[] = []

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()
