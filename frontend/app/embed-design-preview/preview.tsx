'use client'

import { useState } from 'react'
import { EmbedModal } from '@/components/modals/EmbedModal'

export default function Preview() {
  const [open, setOpen] = useState(true)
  return <>
    <button onClick={() => setOpen(true)} style={{ margin: 32, padding: 16 }}>Open integration preview</button>
    <EmbedModal
      isOpen={open}
      onClose={() => setOpen(false)}
      leaderboard={{ address: '0x80783947c9561EFa9BA484D44BBd5AAa03028242', name: 'Sample For Sale', strategy: 'fixed' }}
    />
  </>
}
