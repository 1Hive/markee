'use client'

import { useState, useEffect, useRef } from 'react'

// rAF-based live balance ticker. Runs at ~60fps but only triggers a React re-render when the
// value changes at the given display precision — much less than 60x/sec at typical stream rates.
//
// How: one display unit = 10^(18 - displayDecimals) wei. We track lastUnit and only call
// setBalance when newWei / resolution !== lastUnit, so React renders only for visible changes.
// At 0.001 ETH/mo (380M wei/sec) with 10dp: ~1 render per 267ms.
// At 0.1 ETH/mo: ~1 render per 3ms (near every-frame). Scales automatically.
export function useLiveBalance(
  snapshotWei: bigint,
  ratePerSec: bigint,
  displayDecimals: number = 10,
): bigint {
  const anchor = useRef({ time: performance.now(), snapshot: snapshotWei })
  const frameRef = useRef<number | null>(null)
  const [balance, setBalance] = useState(snapshotWei)

  useEffect(() => {
    anchor.current = { time: performance.now(), snapshot: snapshotWei }
    setBalance(snapshotWei)
    if (ratePerSec === 0n) return

    const resolution = 10n ** BigInt(Math.max(0, 18 - displayDecimals))
    let lastUnit = snapshotWei / resolution

    const tick = () => {
      const elapsedMs = BigInt(Math.floor(performance.now() - anchor.current.time))
      const newWei = anchor.current.snapshot + (elapsedMs * ratePerSec) / 1000n
      const newUnit = newWei / resolution
      if (newUnit !== lastUnit) {
        lastUnit = newUnit
        setBalance(newWei)
      }
      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [snapshotWei, ratePerSec, displayDecimals])

  return balance
}

// Format a live wei balance to a fixed number of decimal places without float precision loss.
export function formatLiveEth(wei: bigint, decimals = 10): string {
  // The zero-padding below assumes an unsigned digit string. A negative snapshot (stale balance plus
  // clock skew) would otherwise leave the sign mid-string and round small deficits away to "0".
  if (wei < 0n) return `-${formatLiveEth(-wei, decimals)}`
  const weiStr = wei.toString()
  const totalDigits = 18
  const padded = weiStr.padStart(totalDigits + 1, '0')
  const intPart = padded.slice(0, padded.length - totalDigits) || '0'
  const decPart = padded.slice(padded.length - totalDigits).padEnd(decimals, '0').slice(0, decimals)
  return `${intPart}.${decPart}`
}
