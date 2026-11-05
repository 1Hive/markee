'use client'
import { useEffect, useRef, useState } from 'react'
import type { MessageCheck } from '../../packages/sdk/src/types'

export async function requestMessageCheck(message: string, signal?: AbortSignal): Promise<MessageCheck> {
  const response = await fetch('/api/moderation/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'draft', message }), signal })
  if (!response.ok) throw new Error('Moderation check unavailable')
  const result = await response.json()
  if (typeof result.enabled !== 'boolean' || !['pass', 'soft-flagged', 'unavailable'].includes(result.state)) throw new Error('Moderation check unavailable')
  return result
}
export function useMessageModeration(message: string, enabled = true, { checkWhileTyping = true }: { checkWhileTyping?: boolean } = {}) {
  const [verdict, setVerdict] = useState<MessageCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const pending = useRef<((result: boolean) => void) | null>(null)
  const current = useRef(message)
  const generation = useRef(0)
  current.current = message
  const unavailable = (): MessageCheck => ({ enabled: true, state: 'unavailable', contentHash: '', engine: '', policyVersion: '', reason: 'Moderation check unavailable' })
  useEffect(() => {
    const token = ++generation.current
    setVerdict(null); setChecking(false)
    pending.current?.(false); pending.current = null; setConfirming(false)
    const controller = new AbortController()
    const cleanup = () => { controller.abort(); generation.current++; pending.current?.(false); pending.current = null }
    if (!enabled || !message.trim() || !checkWhileTyping) return cleanup
    const timer = setTimeout(async () => {
      setChecking(true)
      try { const result = await requestMessageCheck(message, controller.signal); if (generation.current === token) setVerdict(result) }
      catch { if (!controller.signal.aborted && generation.current === token) setVerdict(unavailable()) }
      finally { if (generation.current === token) setChecking(false) }
    }, 400)
    return () => { clearTimeout(timer); cleanup() }
  }, [message, enabled, checkWhileTyping])
  const finish = (result: boolean) => { pending.current?.(result); pending.current = null; setConfirming(false) }
  async function guard(text: string): Promise<boolean> {
    const token = ++generation.current
    setChecking(true)
    let result: MessageCheck
    try { result = await requestMessageCheck(text) } catch { result = unavailable() }
    if (current.current !== text || token !== generation.current) { setChecking(false); return false }
    setVerdict(result); setChecking(false)
    if (!result.enabled || result.state === 'pass') return true
    setConfirming(true)
    return new Promise(resolve => { pending.current = allowed => resolve(allowed && current.current === text) })
  }
  const reason = verdict?.state === 'unavailable' ? 'Moderation check unavailable' : verdict?.reason || 'This message matched an automatic moderation rule.'
  useEffect(() => {
    if (!confirming) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = document.createElement('dialog')
    dialog.setAttribute('aria-label', 'Message moderation warning')
    Object.assign(dialog.style, { padding: '24px', maxWidth: '440px', borderRadius: '12px', background: '#242424', color: 'white', border: '1px solid #666', zIndex: '2147483647' })
    const title = document.createElement('strong'); title.textContent = reason
    const note = document.createElement('p'); note.textContent = 'Your published message may be hidden. Edit it or continue anyway.'
    const buttons = document.createElement('div'); Object.assign(buttons.style, { display: 'flex', gap: '16px', marginTop: '20px' })
    const button = (label: string, click: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = click; Object.assign(b.style, { cursor: 'pointer', padding: '8px', border: '1px solid #777', borderRadius: '6px' }); buttons.append(b) }
    button('Edit message', () => finish(false))
    button('Retry', () => { const token = generation.current; void requestMessageCheck(message).catch(unavailable).then(result => { if (token !== generation.current || current.current !== message) return; setVerdict(result); if (result.state === 'pass') finish(true) }) })
    button('Continue anyway', () => finish(true))
    dialog.append(title, note, buttons); document.body.append(dialog)
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false) })
    dialog.showModal()
    return () => { dialog.close(); dialog.remove(); previous?.focus() }
    // The dialog resolves the current pending request; refs validate the exact text on continuation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming, message, reason])
  const ui = <>
    {checking && <p role="status" style={{ fontSize: 12 }}>Checking message…</p>}
    {verdict?.enabled && verdict.state !== 'pass' && <p role="status" style={{ color: 'var(--markee-warning, #c78b25)', fontSize: 12 }}>{reason} {verdict.state === 'soft-flagged' ? 'Your published message may be hidden. Edit it or continue anyway.' : 'Your message will stay hidden until moderation can be checked.'}</p>}
  </>
  return { guard, ui, checking }
}
