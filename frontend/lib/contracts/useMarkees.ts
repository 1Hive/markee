'use client'

import { useEffect, useState } from 'react'
import type { Markee } from '@/types'

console.log('🚀 useMarkees.ts FILE LOADED!')

export function useMarkees() {
  console.log('🎯 useMarkees() FUNCTION CALLED')
  
  const [markees, setMarkees] = useState<Markee[]>([])
  const [isLoading, setIsLoading] = useState(false) // Start as false
  const [error, setError] = useState<Error | null>(null)

  console.log('🔍 Current state:', { markeesCount: markees.length, isLoading, error })

  useEffect(() => {
    console.log('⚡ useEffect RUNNING')
    
    // Just set immediately - no async, no waiting
    setMarkees([])
    setIsLoading(false)
    setError(null)
    
    console.log('✅ State updated')
  }, [])

  return { markees, isLoading, error }
}
