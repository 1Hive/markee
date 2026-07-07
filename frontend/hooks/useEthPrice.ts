'use client'

import { useState, useEffect } from 'react'

export function useEthPrice(): number | null {
  const [price, setPrice] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/eth-price')
      .then(r => r.json())
      .then(d => { if (typeof d.usd === 'number') setPrice(d.usd) })
      .catch(() => {})
  }, [])

  return price
}
