'use client'

import { useState } from 'react'
import { parseEther } from 'viem'
import { base } from 'viem/chains'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useSwitchChain } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import { REVNET_V6_CONFIG } from '@/lib/contracts/addresses'
import { estimateDirectRevnetMarkeeTokens } from '@/lib/tokenPhases'

const MONO   = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace"
const PINK   = '#F897FE'
const BLUE   = '#7C9CFF'
const BORDER = 'rgba(138,143,191,0.2)'

// Juicebox v4 uses this sentinel address for native ETH
const ETH_TOKEN = '0x000000000000000000000000000000000000EEEe' as const

// Caps each side of the decimal at 9 digits so a pasted/huge value can't blow out the layout.
function sanitizeAmountInput(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot !== -1) cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '')
  const [intPart, fracPart] = cleaned.split('.')
  const cappedInt = (intPart ?? '').slice(0, 9)
  return fracPart !== undefined ? `${cappedInt}.${fracPart.slice(0, 9)}` : cappedInt
}

// M/B/T-abbreviated, NaN-safe MARKEE amount display -- shows extra decimal places for sub-10 amounts
// instead of collapsing to "0" (matches MarkeeSignModal's ReceiveCard).
function formatMarkeeAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 999_999e12) return '>999,999T'
  if (n >= 1e12) return `${(n / 1e12).toFixed(3)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(3)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(3)}M`
  if (n < 10) {
    let decimals = 3
    while (decimals < 12 && Number(n.toFixed(decimals)) === 0) decimals++
    if (decimals > 3) decimals = Math.min(decimals + 2, 12)
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals })
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
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
  const { address, chain } = useAccount()
  const { switchChain } = useSwitchChain()

  const { writeContract, data: txHash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const parsedEth  = parseFloat(amount)
  const eth        = Number.isFinite(parsedEth) ? parsedEth : 0
  const receive    = estimateDirectRevnetMarkeeTokens(Math.max(0, eth))
  const cfg        = REVNET_V6_CONFIG[base.id]

  const handleBuy = () => {
    if (!authenticated || !address) { login(); return }
    if (eth <= 0) return
    if (chain?.id !== base.id) {
      switchChain?.({ chainId: base.id })
      return
    }
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
      chainId: base.id,
    })
  }

  const busy = isPending || isConfirming

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
              setAmount(sanitizeAmountInput(e.target.value))
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
            {formatMarkeeAmount(receive)} MARKEE
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
              placeholder="Optional, displayed publicly on Revnets"
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'none',
                background: '#060A2A', border: `1px solid ${BORDER}`,
                borderRadius: 11, padding: '11px 14px',
                color: '#EDEEFF', fontSize: 14, outline: 'none', lineHeight: 1.4,
                fontFamily: 'Manrope, system-ui, sans-serif',
              }}
            />
          </div>
        )}

        {/* BUY BUTTON / SUCCESS STATE */}
        {isSuccess ? (
          <div style={{
            width: '100%', marginTop: 14,
            background: 'rgba(248,151,254,0.1)', border: `1px solid rgba(248,151,254,0.35)`,
            borderRadius: 10, padding: '15px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: PINK, fontWeight: 700, fontSize: 15 }}>✓ Success!</span>
            {txHash && (
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: BLUE, fontFamily: MONO, fontSize: 11, textDecoration: 'none' }}
              >
                View transaction on Basescan →
              </a>
            )}
          </div>
        ) : (
          <button
            onClick={busy ? undefined : handleBuy}
            disabled={busy}
            style={{
              width: '100%', marginTop: 14,
              background: PINK,
              color: '#060A2A', border: 'none', borderRadius: 10,
              padding: '15px 20px', fontWeight: 700, fontSize: 15,
              cursor: busy ? 'wait' : 'pointer',
              boxShadow: '0 8px 32px rgba(248,151,254,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'opacity 160ms',
              opacity: busy ? 0.8 : 1,
            }}
          >
            {isConfirming ? 'Confirming…' : isPending ? 'Confirm in wallet…' : authenticated ? 'Buy MARKEE' : 'Connect wallet to buy'}
          </button>
        )}
      </div>
    </div>
  )
}
