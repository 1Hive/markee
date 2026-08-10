'use client'

import { useState, useEffect, useRef } from 'react'

// Continuously increments a wei balance at ratePerSec, updating every second.
// snapshotWei is the on-chain value at mount time; ratePerSec drives the ticker.
// Returns a bigint that can be formatted by the caller at any desired precision.
// Safe to call with ratePerSec=0n — no interval is started, snapshot is returned as-is.
export function useLiveBalance(snapshotWei: bigint, ratePerSec: bigint): bigint {
  const anchor = useRef({ time: Date.now(), snapshot: snapshotWei })
  const [balance, setBalance] = useState(snapshotWei)

  useEffect(() => {
    anchor.current = { time: Date.now(), snapshot: snapshotWei }
    setBalance(snapshotWei)
    if (ratePerSec === 0n) return

    const id = setInterval(() => {
      const elapsedMs = BigInt(Date.now() - anchor.current.time)
      setBalance(anchor.current.snapshot + (elapsedMs * ratePerSec) / 1000n)
    }, 1000)
    return () => clearInterval(id)
  }, [snapshotWei, ratePerSec])

  return balance
}

// Format a live wei balance to a fixed number of decimal places.
// Uses viem-compatible string arithmetic to avoid Number precision loss on large bigints.
export function formatLiveEth(wei: bigint, decimals = 10): string {
  const weiStr = wei.toString()
  const totalDigits = 18
  const padded = weiStr.padStart(totalDigits + 1, '0')
  const intPart = padded.slice(0, padded.length - totalDigits) || '0'
  const decPart = padded.slice(padded.length - totalDigits).padEnd(decimals, '0').slice(0, decimals)
  return `${intPart}.${decPart}`
}
