'use client'

import { useState, useEffect } from 'react'

const ANIMATION_MINIMUM_STEP_TIME = 100

// Animates a value that grows at `flowRate` wei/sec from a snapshot (`startingAmount` at
// `startingTimestamp`, unix seconds), driven by requestAnimationFrame. Mirrors the Superfluid
// dashboard's flowingAmount so a streamed total ticks up live between on-chain refetches.
export default function useFlowingAmount(
  startingAmount: bigint,
  startingTimestamp: number,
  flowRate: bigint,
) {
  const [flowingAmount, setFlowingAmount] = useState(startingAmount)

  useEffect(() => {
    if (flowRate === 0n) {
      setFlowingAmount(startingAmount)
      return
    }

    let lastAnimationTimestamp: DOMHighResTimeStamp = 0

    const animationStep = (currentAnimationTimestamp: DOMHighResTimeStamp) => {
      animationFrameId = window.requestAnimationFrame(animationStep)

      if (currentAnimationTimestamp - lastAnimationTimestamp > ANIMATION_MINIMUM_STEP_TIME) {
        lastAnimationTimestamp = currentAnimationTimestamp

        const elapsedTimeInMilliseconds = BigInt(Date.now() - startingTimestamp * 1000)
        setFlowingAmount(startingAmount + (flowRate * elapsedTimeInMilliseconds) / 1000n)
      }
    }

    let animationFrameId = window.requestAnimationFrame(animationStep)

    return () => window.cancelAnimationFrame(animationFrameId)
  }, [startingAmount, startingTimestamp, flowRate])

  return flowingAmount
}
