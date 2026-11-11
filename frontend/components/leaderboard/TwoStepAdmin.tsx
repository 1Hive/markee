'use client'

import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { zeroAddress } from 'viem'
import { AdminSettingRow } from '@/components/leaderboard/AdminSettingRow'
import { WalletPending, fmtAddr, isUserRejection } from '@/components/account/primitives'
import { LeaderboardV14AdminABI } from '@/lib/contracts/abis'
import { CANONICAL_CHAIN } from '@/lib/contracts/addresses'
import { formatReceiptError } from '@/lib/transactionErrors'
import { PINK, BG, TEXT, TEXT2, MUTED, BORDER, SANS, MONO, DANGER } from '@/lib/design-tokens'

type AdminCall = 'acceptAdmin' | 'cancelAdminTransfer'

function usePendingAdmin(board: `0x${string}`) {
  const { data, refetch } = useReadContract({
    address: board, abi: LeaderboardV14AdminABI, functionName: 'pendingAdmin', chainId: CANONICAL_CHAIN.id,
  })
  const pendingAdmin = data && data !== zeroAddress ? data : null
  return { pendingAdmin, refetch }
}

function useAdminCall(board: `0x${string}`, onDone: () => void) {
  const { chain } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { writeContractAsync, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: reverted, error: receiptError } = useWaitForTransactionReceipt({ hash, chainId: CANONICAL_CHAIN.id })
  const [error, setError] = useState<string | null>(null)
  const isWrongChain = !!chain && chain.id !== CANONICAL_CHAIN.id

  useEffect(() => {
    if (!isSuccess) return
    reset()
    onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  useEffect(() => {
    if (reverted && hash) setError(formatReceiptError(receiptError, 'TwoStepAdmin.receipt'))
  }, [reverted, hash, receiptError])

  async function send(functionName: AdminCall) {
    setError(null)
    if (isWrongChain) { switchChain({ chainId: CANONICAL_CHAIN.id }); return }
    try {
      await writeContractAsync({ address: board, abi: LeaderboardV14AdminABI, functionName, chainId: CANONICAL_CHAIN.id })
    } catch (e) {
      if (isUserRejection(e)) return
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      setError(msg.length > 180 ? `${msg.slice(0, 180)}…` : msg)
    }
  }

  return { send, busy: isPending || isConfirming, switching, isWrongChain, error }
}

const outlineBtn: React.CSSProperties = { background: 'transparent', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: SANS, cursor: 'pointer', whiteSpace: 'nowrap' }

export function TwoStepAdminTransfer({ board, onProposed, onCancelled }: {
  board: `0x${string}`
  onProposed: () => void
  onCancelled: () => void
}) {
  const { pendingAdmin, refetch } = usePendingAdmin(board)
  const cancel = useAdminCall(board, () => { refetch(); onCancelled() })

  return (
    <>
      {pendingAdmin && (
        <div style={{ marginBottom: 16, padding: '12px 14px', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.6, textTransform: 'uppercase', color: MUTED }}>Pending admin</div>
              <div title={pendingAdmin} style={{ fontFamily: MONO, fontSize: 13, color: TEXT, marginTop: 4 }}>{fmtAddr(pendingAdmin)}</div>
            </div>
            {cancel.busy ? <WalletPending /> : (
              <button onClick={() => cancel.send('cancelAdminTransfer')} disabled={cancel.switching} style={{ ...outlineBtn, color: TEXT2, border: `1px solid ${BORDER}` }}>
                {cancel.isWrongChain ? 'Switch to Base' : 'Cancel Transfer'}
              </button>
            )}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: TEXT2, lineHeight: 1.5 }}>
            You stay admin until this wallet accepts on the Markee&apos;s page.
          </p>
          {cancel.error && <p style={{ margin: '8px 0 0', fontSize: 12, color: DANGER }}>{cancel.error}</p>}
        </div>
      )}
      <AdminSettingRow
        label="Transfer Admin" contractAddress={board} abi={LeaderboardV14AdminABI} getterName="pendingAdmin" setterName="setAdmin" inputType="address"
        dangerous="confirm"
        warning="Proposes another wallet as admin. Nothing changes until that wallet accepts on this Markee's page, and you can cancel before then."
        acknowledge="I understand I'll lose all admin access once the new wallet accepts"
        onSuccess={() => { refetch(); onProposed() }}
      />
    </>
  )
}

export function AcceptAdminBanner({ board, onAccepted }: { board: `0x${string}`; onAccepted: () => void }) {
  const { address } = useAccount()
  const { pendingAdmin, refetch } = usePendingAdmin(board)
  const [accepted, setAccepted] = useState(false)
  const accept = useAdminCall(board, () => { setAccepted(true); refetch(); onAccepted() })

  const isPendingAdmin = !!address && !!pendingAdmin && pendingAdmin.toLowerCase() === address.toLowerCase()
  if (!accepted && !isPendingAdmin) return null

  return (
    <section style={{ padding: '14px 40px', borderBottom: `1px solid ${BORDER}`, background: BG }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, color: TEXT2, fontFamily: SANS }}>
          {accepted ? 'You are now the admin of this Markee.' : 'You have been proposed as the admin of this Markee.'}
        </span>
        {!accepted && (accept.busy ? <WalletPending /> : (
          <button onClick={() => accept.send('acceptAdmin')} disabled={accept.switching} style={{ ...outlineBtn, color: PINK, border: `1px solid ${PINK}` }}>
            {accept.isWrongChain ? 'Switch to Base' : 'Accept Admin'}
          </button>
        ))}
      </div>
      {accept.error && <div style={{ maxWidth: 1100, margin: '8px auto 0', fontSize: 12, color: DANGER }}>{accept.error}</div>}
    </section>
  )
}
