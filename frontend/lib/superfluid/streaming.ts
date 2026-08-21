import {
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from 'viem'

import { SECONDS_IN_MONTH } from '@/lib/strategy'

// Mirrors StreamingLeaderboard.sol constants. SECONDS_IN_MONTH lives in lib/strategy (the shared
// ranking module) and is re-exported here so streaming callers keep their import path.
export { SECONDS_IN_MONTH }
export const BUFFER_PERIOD = 14400n // Base Superfluid liquidation (buffer) period: 4h.

// Base Superfluid protocol addresses.
export const STREAMING_BASE = {
  host: '0x4C073B3baB6d8826b8C5b229f3cfdC1eC6E47E74',
  ethx: '0x46fd5cfB4c12D87acD3a13e92BAa53240C661D93',
  cfaForwarder: '0xcfA132E353cB4E398080B9700609bb008eceB125',
} as const satisfies Record<string, Address>

// Superfluid batch operation types.
const OP_CALL_AGREEMENT = 201
const OP_SIMPLE_FORWARD_CALL = 301

// host.getAgreementClass(this) returns the ConstantFlowAgreementV1 class (the op-201 target).
export const CFA_AGREEMENT_ID = keccak256(
  toBytes('org.superfluid-finance.agreements.ConstantFlowAgreement.v1'),
)

// GeneralDistributionAgreementV1 class, the op-201 target for the refund-pool connect.
export const GDA_AGREEMENT_ID = keccak256(
  toBytes('org.superfluid-finance.agreements.GeneralDistributionAgreement.v1'),
)

// ── Rate helpers ────────────────────────────────────────────────────────────

// Floor(weiPerMonth) rounds down, so rate*SECONDS_IN_MONTH < weiPerMonth -- if that recovered value
// falls below the board's minimum, the board reverts with BelowMinimumRate. Ceiling avoids that
// unconditionally (recovered >= weiPerMonth always), at the cost of a tiny built-in overage on any
// weiPerMonth that isn't an exact multiple of SECONDS_IN_MONTH (e.g. 0.001 ETH/mo recovers as
// 0.001000000000512 ETH/mo).
//
// When the caller knows the board's actual on-chain minimumMonthlyRate, floor first and only fall
// back to ceiling if the floor-recovered value would actually undershoot *that* minimum -- this is
// what lets an exact 0.001 ETH/mo entry land as-typed on a board whose minimum was deliberately set
// just below it, while still guaranteeing success (via the ceiling fallback) on any board whose
// minimum wasn't adjusted.
export function monthlyToRatePerSec(weiPerMonth: bigint, minimumMonthlyRate?: bigint): bigint {
  const floorRate = weiPerMonth / SECONDS_IN_MONTH
  if (minimumMonthlyRate !== undefined && floorRate * SECONDS_IN_MONTH >= minimumMonthlyRate) {
    return floorRate
  }
  return (weiPerMonth + SECONDS_IN_MONTH - 1n) / SECONDS_IN_MONTH
}

const THOUSANDTH_ETH = 1_000_000_000_000_000n // 0.001 ETH

// A board's on-chain minimumMonthlyRate is often deliberately set a hair under a round number (e.g.
// 999999997884000 wei instead of exactly 0.001 ETH, so 0.001 floor-rounds instead of overshooting --
// see monthlyToRatePerSec above). That's the right on-chain value, but showing it verbatim as the MIN
// preset/placeholder ("0.000999999997884") reads as a bug, not a feature. Round up to the nearest
// 0.001 ETH for display/input purposes instead -- always >= the real minimum, so it still passes.
export function roundUpToNearestThousandth(weiPerMonth: bigint): bigint {
  if (weiPerMonth <= 0n) return 0n
  return ((weiPerMonth + THOUSANDTH_ETH - 1n) / THOUSANDTH_ETH) * THOUSANDTH_ETH
}

export function ratePerSecToMonthly(ratePerSec: bigint): bigint {
  return ratePerSec * SECONDS_IN_MONTH
}

export function bufferFor(ratePerSec: bigint): bigint {
  return ratePerSec * BUFFER_PERIOD
}

// Seconds a given ETHx balance keeps a stream of `ratePerSec` alive.
export function runwaySeconds(balance: bigint, ratePerSec: bigint): bigint {
  if (ratePerSec === 0n) return 0n
  return balance / ratePerSec
}

const SECONDS_IN_DAY = 86_400n
const SECONDS_IN_WEEK = 604_800n

// 3 decimals is plenty for a typical ETHx balance, but rounds anything under 0.001 down to "0.000" --
// indistinguishable from genuinely empty. Bump to 4 decimals under that threshold so a small-but-real
// balance (e.g. enough for a few days of a minimum-rate stream) still shows as nonzero.
export function formatEthxBalanceDisplay(value: bigint): string {
  const num = parseFloat(formatEther(value))
  return num.toFixed(num < 0.001 ? 4 : 3)
}

// "2mo 14d 06h 42m 09s" -- the Deposit Manager's "runs out in" countdown format. Hours/minutes/
// seconds are zero-padded (matches a clock reading), months/days aren't (there's no fixed width to
// pad to). Seconds are what make the countdown visibly tick on screen, not just when a whole minute
// rolls over.
export function formatRunway(seconds: bigint): string {
  const s = seconds > 0n ? seconds : 0n
  const months = s / SECONDS_IN_MONTH
  const days = (s % SECONDS_IN_MONTH) / SECONDS_IN_DAY
  const hours = (s % SECONDS_IN_DAY) / 3600n
  const minutes = (s % 3600n) / 60n
  const secs = s % 60n
  const pad = (n: bigint) => n.toString().padStart(2, '0')
  const parts: string[] = []
  if (months > 0n) parts.push(`${months}mo`)
  if (months > 0n || days > 0n) parts.push(`${days}d`)
  parts.push(`${pad(hours)}h`, `${pad(minutes)}m`, `${pad(secs)}s`)
  return parts.join(' ')
}

// "2mo 0d 1h" -- the compact form used inline on the rate cards (RateCard/RatePriceCard), next to
// the Deposit Manager link. Always all three units, unpadded, no minutes -- there's no room for the
// full clock-style formatRunway there.
export function formatRunwayShort(seconds: bigint): string {
  const s = seconds > 0n ? seconds : 0n
  const months = s / SECONDS_IN_MONTH
  const days = (s % SECONDS_IN_MONTH) / SECONDS_IN_DAY
  const hours = (s % SECONDS_IN_DAY) / 3600n
  return `${months}mo ${days}d ${hours}h`
}

// Runway progress bar: full at 3 months or more (matches the auto-deposit default), so a freshly
// funded stream always starts the bar full.
export function runwayProgressPct(seconds: bigint): number {
  const cap = SECONDS_IN_MONTH * 3n
  if (seconds >= cap) return 100
  if (seconds <= 0n) return 0
  return Number((seconds * 100n) / cap)
}

export type RunwayTier = 'normal' | 'warning' | 'danger'

// Yellow under a week, red under a day -- the two thresholds the Deposit Manager's progress bar
// color-codes against.
export function runwayTier(seconds: bigint): RunwayTier {
  if (seconds < SECONDS_IN_DAY) return 'danger'
  if (seconds < SECONDS_IN_WEEK) return 'warning'
  return 'normal'
}

// ── Auto-computed deposit (replaces the old 1/2/3-month picker) ────────────

export interface AutoDeposit {
  // Native ETH to wrap fresh this tx. 0 when the wallet's existing ETHx balance already clears what
  // this rate needs.
  wrapValue: bigint
  // ETHx left in the wallet after the board's buffer pull -- what actually funds the stream over
  // time. Combines any pre-existing balance with wrapValue.
  prefund: bigint
  // How long that prefund sustains the stream at ratePerSec.
  runwaySeconds: bigint
  // True when even the best wrap this wallet can afford still wouldn't clear the CFA's own minimum
  // buffer requirement (~4h of runway) -- the wallet doesn't hold enough ETH to fund this stream at
  // all right now, not just "less than the usual 3-month default."
  insufficientEth: boolean
}

const ETHX_AUTO_WRAP_RESERVE = 1_000_000_000_000_000n // 0.001 ETH kept unwrapped for gas
// Below this, a flat 0.001 ETH reserve can eat most or all of the balance (or push "affordable"
// negative), which is exactly the small-balance case this exists to handle -- switch to reserving a
// percentage instead, which scales down gracefully instead of hitting a hard floor. Gas on Base is
// cheap enough that holding back 10% still leaves plenty for the tx itself.
const ETHX_AUTO_WRAP_SMALL_BALANCE_THRESHOLD = 2_000_000_000_000_000n // 0.002 ETH
const ETHX_AUTO_WRAP_SMALL_BALANCE_PCT = 90n

// The CFA requires the backer's own wallet balance to clear the flow's buffer too, on top of what
// the board's depositBuffer pulls out of it -- so "already enough" means the existing balance clears
// more than 2x the buffer, not just enough to cover the pull. Below that, default to wrapping 3
// months' worth of ETH at this rate, capped at what's actually spendable.
export function computeAutoDeposit(ethxBalance: bigint, ratePerSec: bigint, walletEthBalance: bigint): AutoDeposit {
  if (ratePerSec <= 0n) return { wrapValue: 0n, prefund: 0n, runwaySeconds: 0n, insufficientEth: false }
  const buffer = bufferFor(ratePerSec)
  if (ethxBalance > buffer * 2n) {
    const prefund = ethxBalance - buffer
    return { wrapValue: 0n, prefund, runwaySeconds: runwaySeconds(prefund, ratePerSec), insufficientEth: false }
  }
  const threeMonths = ratePerSecToMonthly(ratePerSec) * 3n
  const affordable = walletEthBalance >= ETHX_AUTO_WRAP_SMALL_BALANCE_THRESHOLD
    ? (walletEthBalance > ETHX_AUTO_WRAP_RESERVE ? walletEthBalance - ETHX_AUTO_WRAP_RESERVE : 0n)
    : (walletEthBalance * ETHX_AUTO_WRAP_SMALL_BALANCE_PCT) / 100n
  const wrapValue = threeMonths < affordable ? threeMonths : affordable
  const prefundRaw = ethxBalance + wrapValue - buffer
  const prefund = prefundRaw > 0n ? prefundRaw : 0n
  return {
    wrapValue, prefund,
    runwaySeconds: prefund > 0n ? runwaySeconds(prefund, ratePerSec) : 0n,
    // Mirrors the on-chain/write-flow check (prefund must exceed buffer, not just reach it).
    insufficientEth: prefund <= buffer,
  }
}

// ── Batched open: wrap → depositBuffer → createFlow (host.batchCall). The depositBuffer pull is
// authorized by a plain ERC20 approve sent as its own transaction beforehand (an in-batch approve is
// impossible: op-301 forwards with SimpleForwarder as sender, and Privy's embedded-wallet typed-data
// signing UI is broken, which rules the EIP-2612 permit route out).

const ETHX_BATCH_ABI = [
  { type: 'function', name: 'upgradeByETHTo', stateMutability: 'payable', inputs: [{ name: 'to', type: 'address' }], outputs: [] },
] as const

const DEPOSIT_BUFFER_ABI = [
  {
    type: 'function',
    name: 'depositBuffer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'backer', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

const CFA_CREATE_FLOW_ABI = [
  {
    type: 'function',
    name: 'createFlow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'flowRate', type: 'int96' },
      { name: 'ctx', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
] as const

const CFA_UPDATE_FLOW_ABI = [
  {
    type: 'function',
    name: 'updateFlow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'flowRate', type: 'int96' },
      { name: 'ctx', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
] as const

const CFA_DELETE_FLOW_ABI = [
  {
    type: 'function',
    name: 'deleteFlow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'ctx', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
] as const

const GDA_CONNECT_POOL_ABI = [
  {
    type: 'function',
    name: 'connectPool',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'ctx', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
] as const

export interface Operation {
  operationType: number
  target: Address
  data: Hex
}

export interface OpenStreamParams {
  ethx: Address
  board: Address
  markee: Address
  backer: Address
  ratePerSec: bigint
  buffer: bigint
  cfaAgreement: Address
  gdaAgreement: Address
  pool: Address
  // Native ETH wrapped in this batch (0 when the wallet's existing ETHx balance already covers the
  // stream -- upgradeByETH reverts on a 0 amount, so the wrap op must be omitted entirely then, not
  // just sent with 0 value).
  wrapValue: bigint
}

// Returns the ops for host.batchCall, in the order the strategy requires: the value-bearing wrap
// first when there is one (it drains the host balance so the later value-0 forwards don't revert),
// then the buffer deposit credited to the explicit backer (pulled via the backer's prior ERC20
// approve), then the markee-tagged createFlow (op 201 preserves the backer as the flow sender), then
// connectPool on the markee's GDA refund pool. The connect is mandatory, not cosmetic: a disconnected
// backer's wallet drains at the full stream rate while the refund accrues unclaimed in the pool, so
// they could be liquidated even while being refunded. It must be op 201 straight to the GDA class (a
// 301 via GDAv1Forwarder would connect SimpleForwarder instead), and it no-ops if already connected.
export function buildOpenStreamOps(p: OpenStreamParams): Operation[] {
  const ops: Operation[] = []

  if (p.wrapValue > 0n) {
    ops.push({
      operationType: OP_SIMPLE_FORWARD_CALL,
      target: p.ethx,
      data: encodeFunctionData({ abi: ETHX_BATCH_ABI, functionName: 'upgradeByETHTo', args: [p.backer] }),
    })
  }

  ops.push({
    operationType: OP_SIMPLE_FORWARD_CALL,
    target: p.board,
    data: encodeFunctionData({ abi: DEPOSIT_BUFFER_ABI, functionName: 'depositBuffer', args: [p.backer, p.buffer] }),
  })

  const callData = encodeFunctionData({
    abi: CFA_CREATE_FLOW_ABI,
    functionName: 'createFlow',
    args: [p.ethx, p.board, p.ratePerSec, '0x'],
  })
  const userData = encodeAbiParameters([{ type: 'address' }], [p.markee])

  ops.push({
    operationType: OP_CALL_AGREEMENT,
    target: p.cfaAgreement,
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [callData, userData]),
  })

  const connectData = encodeFunctionData({
    abi: GDA_CONNECT_POOL_ABI,
    functionName: 'connectPool',
    args: [p.pool, '0x'],
  })

  ops.push({
    operationType: OP_CALL_AGREEMENT,
    target: p.gdaAgreement,
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [connectData, '0x']),
  })

  return ops
}

export interface MoveStreamOpsParams extends OpenStreamParams {
  // Extra deposit the board must hold for the new rate (0 when the existing deposit already covers it).
  depositTopUp: bigint
}

// Retargets an existing stream to a different markee on the same board: deleteFlow + createFlow in
// one batch. updateFlow CANNOT retarget — the board's onFlowUpdated ignores userData and applies the
// rate to backerMarkee[sender] (the old markee); only onFlowCreated decodes userData. The delete
// clears backerMarkee and the old markee's units, then the create re-tags the flow to the new markee.
// backerDeposit survives the delete, so only the top-up over the held deposit is pulled.
export function buildMoveStreamOps(p: MoveStreamOpsParams): Operation[] {
  const ops: Operation[] = []

  if (p.wrapValue > 0n) {
    ops.push({
      operationType: OP_SIMPLE_FORWARD_CALL,
      target: p.ethx,
      data: encodeFunctionData({ abi: ETHX_BATCH_ABI, functionName: 'upgradeByETHTo', args: [p.backer] }),
    })
  }

  if (p.depositTopUp > 0n) {
    ops.push({
      operationType: OP_SIMPLE_FORWARD_CALL,
      target: p.board,
      data: encodeFunctionData({ abi: DEPOSIT_BUFFER_ABI, functionName: 'depositBuffer', args: [p.backer, p.depositTopUp] }),
    })
  }

  const deleteCallData = encodeFunctionData({
    abi: CFA_DELETE_FLOW_ABI,
    functionName: 'deleteFlow',
    args: [p.ethx, p.backer, p.board, '0x'],
  })
  ops.push({
    operationType: OP_CALL_AGREEMENT,
    target: p.cfaAgreement,
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [deleteCallData, '0x']),
  })

  const createCallData = encodeFunctionData({
    abi: CFA_CREATE_FLOW_ABI,
    functionName: 'createFlow',
    args: [p.ethx, p.board, p.ratePerSec, '0x'],
  })
  const userData = encodeAbiParameters([{ type: 'address' }], [p.markee])
  ops.push({
    operationType: OP_CALL_AGREEMENT,
    target: p.cfaAgreement,
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [createCallData, userData]),
  })

  const connectData = encodeFunctionData({
    abi: GDA_CONNECT_POOL_ABI,
    functionName: 'connectPool',
    args: [p.pool, '0x'],
  })
  ops.push({
    operationType: OP_CALL_AGREEMENT,
    target: p.gdaAgreement,
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [connectData, '0x']),
  })

  return ops
}

// Native ETH to send with the batch: the buffer (pulled back into the board as the SuperApp deposit)
// plus the prefund the backer keeps as ETHx to sustain the stream over time.
export function openStreamValue(buffer: bigint, prefund: bigint): bigint {
  return buffer + prefund
}

export interface UpdateStreamParams {
  ethx: Address
  board: Address
  backer: Address
  ratePerSec: bigint
  // Extra buffer the board must hold for the new rate (0 when the existing deposit already covers it).
  depositTopUp: bigint
  // Native ETH wrapped in the same batch: the deposit top-up plus any added runway.
  wrapValue: bigint
  cfaAgreement: Address
}

// Rate change on a live stream. onFlowUpdated takes the Markee from backerMarkee[sender], so unlike
// the open batch this one carries no userData, and the pool connect is already in place. The board
// rejects the update unless backerDeposit covers newRate * BUFFER_PERIOD, so the deposit top-up has
// to land in the same batch, before the flow op.
export function buildUpdateStreamOps(p: UpdateStreamParams): Operation[] {
  const ops: Operation[] = []

  if (p.wrapValue > 0n) {
    ops.push({
      operationType: OP_SIMPLE_FORWARD_CALL,
      target: p.ethx,
      data: encodeFunctionData({ abi: ETHX_BATCH_ABI, functionName: 'upgradeByETHTo', args: [p.backer] }),
    })
  }

  if (p.depositTopUp > 0n) {
    ops.push({
      operationType: OP_SIMPLE_FORWARD_CALL,
      target: p.board,
      data: encodeFunctionData({ abi: DEPOSIT_BUFFER_ABI, functionName: 'depositBuffer', args: [p.backer, p.depositTopUp] }),
    })
  }

  const callData = encodeFunctionData({
    abi: CFA_UPDATE_FLOW_ABI,
    functionName: 'updateFlow',
    args: [p.ethx, p.board, p.ratePerSec, '0x'],
  })

  ops.push({
    operationType: OP_CALL_AGREEMENT,
    target: p.cfaAgreement,
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [callData, '0x']),
  })

  return ops
}

// ── Protocol ABIs the modal calls directly ─────────────────────────────────

export const SUPERFLUID_HOST_ABI = [
  {
    type: 'function',
    name: 'batchCall',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'operations',
        type: 'tuple[]',
        components: [
          { name: 'operationType', type: 'uint32' },
          { name: 'target', type: 'address' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getAgreementClass',
    stateMutability: 'view',
    inputs: [{ name: 'agreementType', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

// CFAv1Forwarder: setFlowrate(token, receiver, flowrate) routes create/update/delete by current vs
// target rate, with msg.sender as the flow sender. flowrate 0 closes the stream.
export const CFA_FORWARDER_ABI = [
  {
    type: 'function',
    name: 'setFlowrate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'flowrate', type: 'int96' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getFlowrate',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: '', type: 'int96' }],
  },
] as const

// ETHx is a SETH wrapper: upgradeByETH() turns the sent ETH into the caller's own ETHx, which is what
// funds a live stream (the CFA drains this balance, not the wallet's native ETH).
export const ETHX_WRAP_ABI = [
  { type: 'function', name: 'upgradeByETH', stateMutability: 'payable', inputs: [], outputs: [] },
  // The reverse: burns ETHx and returns native ETH 1:1, for the Deposit Manager's Withdraw. Must be
  // downgradeToETH (ISETH), not the generic ISuperToken.downgrade -- ETHx is Super ETH, backed by
  // native ETH held directly rather than an ERC20 "underlying" token, so plain downgrade() reverts
  // with "no underlying supertoken".
  { type: 'function', name: 'downgradeToETH', stateMutability: 'nonpayable', inputs: [{ name: 'wad', type: 'uint256' }], outputs: [] },
] as const

// The per-Markee GDA refund pool: units are the backer's share of that Markee's aggregate rate, which
// is also the split the board settles the retained top rate on.
export const SUPERFLUID_POOL_ABI = [
  {
    type: 'function',
    name: 'getUnits',
    stateMutability: 'view',
    inputs: [{ name: 'member', type: 'address' }],
    outputs: [{ name: '', type: 'uint128' }],
  },
] as const
