'use client'

import { useState } from 'react'
import { parseEther } from 'viem'
import { base } from 'viem/chains'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { REVNET_V6_CONFIG } from '@/lib/contracts/addresses'

const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const BORDER = 'rgba(138,143,191,0.2)'

// Juicebox v4 uses this sentinel address for native ETH
const ETH_TOKEN = '0x000000000000000000000000000000000000EEEe' as const

// Buyer receives 62% of issued tokens; 38% goes to the community reserve
const BUYER_SHARE = 0.62

// Issuance schedule — mirrors owners/page.tsx buildPhases()
const SEASON_MS      = 91.31 * 24 * 60 * 60 * 1000
const SCHEDULE_START = new Date('2025-12-21T00:00:00Z')

function buildPhases(): { rate: number; end: Date }[] {
  const rules = [
    { cut: 0.5, seasons: 4 },
    { cut: 0.2, seasons: 8 },
    { cut: 0.1, seasons: 6 },
  ]
  const out: { rate: number; end: Date }[] = []
  let rate = 100_000, idx = 0
  for (const r of rules) {
    for (let i = 0; i < r.seasons; i++) {
      out.push({ rate: Math.round(rate), end: new Date(SCHEDULE_START.getTime() + (idx + 1) * SEASON_MS) })
      rate *= (1 - r.cut)
      idx++
    }
  }
  return out
}

const PHASES = buildPhases()

function currentGrossRate(): number {
  const now = Date.now()
  for (const p of PHASES) if (now < p.end.getTime()) return p.rate
  return PHASES[PHASES.length - 1].rate
}

const JB_TERMINAL_PAY_ABI = [
  {
    name: 'pay',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'projectId',          type: 'uint256' },
      { name: 'token',              type: 'address' },
      { name: 'amount',             type: 'uint256' },
      { name: 'beneficiary',        type: 'address' },
      { name: 'minReturnedTokens',  type: 'uint256' },
      { name: 'memo',               type: 'string'  },
      { name: 'metadata',           type: 'bytes'   },
    ],
    outputs: [{ name: 'beneficiaryTokenCount', type: 'uint256' }],
  },
] as const

interface Props {
  compact?: boolean
}

export function RevnetBuyWidget({ compact = false }: Props) {
  const [amount,   setAmount]   = useState('0.1')
  const [expanded, setExpanded] = useState(false)
  const [message,  setMessage]  = useState('')

  const { authenticated, login } = usePrivy()
  const { address } = useAccount()

  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const eth        = parseFloat(amount) || 0
  const grossRate  = currentGrossRate()
  const receive    = Math.round(eth * grossRate * BUYER_SHARE)
  const cfg        = REVNET_V6_CONFIG[base.id]

  const handleBuy = () => {
    if (!authenticated || !address) { login(); return }
    if (eth <= 0) return
    writeContract({
      address: cfg.terminal,
      abi:     JB_TERMINAL_PAY_ABI,
      functionName: 'pay',
      args: [
        BigInt(cfg.projectId),
        ETH_TOKEN,
        parseEther(amount),
        address,
        0n,
        message,
        '0x' as `0x${string}`,
      ],
      value: parseEther(amount),
    })
  }

  const busy = isPending || isConfirming
  const btnLabel = isSuccess   ? '✓ MARKEE sent!'
    : isConfirming              ? 'Confirming…'
    : isPending                 ? 'Confirm in wallet…'
    : authenticated             ? 'Buy MARKEE'
    :                             'Connect wallet to buy'

  return (
    <div style={{
      width: 'min(440px, 100%)',
      margin: compact ? '24px auto 0' : '36px auto 22px',
      textAlign: 'left',
    }}>
      <div style={{
        background: '#0A0F3D', border: `1px solid ${BORDER}`,
        borderRadius: 16, padding: 16,
        boxShadow: '0 18px 50px rgba(6,10,42,0.5)',
      }}>
        {/* YOU PAY */}
        <label style={{
          display: 'block', fontFamily: MONO, fontSize: 10,
          letterSpacing: 1.5, textTransform: 'uppercase',
          color: '#8A8FBF', margin: '2px 0 8px 2px',
        }}>
          You pay
        </label>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#060A2A', border: `1px solid ${BORDER}`,
          borderRadius: 11, padding: '0 14px',
        }}>
          <input
            value={amount}
            onChange={e => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ''))
              if (isSuccess) reset()
            }}
            inputMode="decimal"
            aria-label="ETH amount"
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none',
              color: '#EDEEFF', fontFamily: MONO, fontSize: 22, fontWeight: 700,
              padding: '14px 0', outline: 'none', letterSpacing: -0.5,
            }}
          />
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#B8B6D9' }}>ETH</span>
        </div>

        {/* YOU RECEIVE */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px 0' }}>
          <span style={{ color: '#8A8FBF', fontSize: 13 }}>You receive</span>
          <span style={{ color: '#F897FE', fontWeight: 800, fontFamily: MONO, fontSize: 18, letterSpacing: -0.3 }}>
            {receive.toLocaleString()} MARKEE
          </span>
        </div>

        {/* ADD A MESSAGE */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'transparent', border: 'none',
              color: expanded ? '#F897FE' : '#B8B6D9',
              cursor: 'pointer', fontFamily: MONO, fontSize: 12,
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{expanded ? '−' : '+'}</span> Add a message
          </button>
        </div>
        {expanded && (
          <div style={{ marginTop: 12 }}>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={2}
              placeholder="Set a message with your payment."
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'none',
                background: '#060A2A', border: `1px solid ${BORDER}`,
                borderRadius: 11, padding: '11px 14px',
                color: '#EDEEFF', fontSize: 14, outline: 'none', lineHeight: 1.4,
              }}
            />
          </div>
        )}

        {/* BUY BUTTON */}
        <button
          onClick={busy ? undefined : handleBuy}
          disabled={busy}
          style={{
            width: '100%', marginTop: 14,
            background: isSuccess ? '#1DB227' : '#F897FE',
            color: '#060A2A', border: 'none', borderRadius: 10,
            padding: '15px 20px', fontWeight: 700, fontSize: 15,
            cursor: busy ? 'wait' : 'pointer',
            boxShadow: isSuccess
              ? '0 8px 32px rgba(29,178,39,0.3)'
              : '0 8px 32px rgba(248,151,254,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 160ms, box-shadow 160ms',
            opacity: busy ? 0.8 : 1,
          }}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  )
}
