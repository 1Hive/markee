'use client'

import { useEffect } from 'react'

export function VisibilityPause() {
  useEffect(() => {
    const update = () => document.body.classList.toggle('page-hidden', document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return null
}
