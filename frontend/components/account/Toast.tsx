'use client'

// The dashboard's success toast: bottom-center, one at a time, 2.2s. Errors stay inline next to the
// control that failed instead.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { BG, TEXT, SANS } from '@/lib/design-tokens'

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const toast = useCallback((next: string) => {
    clearTimeout(timer.current)
    setMessage(next)
    timer.current = setTimeout(() => setMessage(null), 2200)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 400, background: TEXT, color: BG, fontFamily: SANS, fontSize: 13.5, fontWeight: 700, borderRadius: 10, padding: '10px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.45)', animation: 'fadeIn 160ms ease', whiteSpace: 'nowrap' }}
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
