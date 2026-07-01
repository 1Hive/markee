import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseSignature,
  toBytes,
  type Address,
  type Hex,
} from 'viem'

// Mirrors StreamingLeaderboard.sol constants.
export const SECONDS_IN_MONTH = 2628000n
export const BUFFER_PERIOD = 14400n // Base Superfluid liquidation (buffer) period: 4h.

// Base Superfluid protocol addresses (confirmed against the fork tests' setUp).
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

// ── Rate helpers ────────────────────────────────────────────────────────────

export function monthlyToRatePerSec(weiPerMonth: bigint): bigint {
  return weiPerMonth / SECONDS_IN_MONTH
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

// ── EIP-2612 permit (authorizes the in-batch depositBuffer pull, no ERC20 approve op exists) ──

export interface PermitParams {
  tokenName: string
  chainId: number
  ethx: Address
  owner: Address
  spender: Address
  value: bigint
  nonce: bigint
  deadline: bigint
}

export function buildPermitTypedData(p: PermitParams) {
  return {
    domain: {
      name: p.tokenName,
      version: '1', // Superfluid SuperToken EIP-712 version; verify against ETHx on a Base fork.
      chainId: p.chainId,
      verifyingContract: p.ethx,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit' as const,
    message: {
      owner: p.owner,
      spender: p.spender,
      value: p.value,
      nonce: p.nonce,
      deadline: p.deadline,
    },
  }
}

export function splitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const { r, s, v } = parseSignature(signature)
  return { v: Number(v ?? 27n), r, s }
}

// ── Single-tx open: wrap → permit → depositBuffer → createFlow (host.batchCall) ──

const ETHX_BATCH_ABI = [
  { type: 'function', name: 'upgradeByETHTo', stateMutability: 'payable', inputs: [{ name: 'to', type: 'address' }], outputs: [] },
  {
    type: 'function',
    name: 'permit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
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
  permit: { deadline: bigint; v: number; r: Hex; s: Hex }
}

// Returns the 4 ops for host.batchCall, in the order the strategy requires: the value-bearing wrap
// first (it drains the host balance so the later value-0 forwards don't revert), then the permit that
// authorizes the buffer pull, then the buffer deposit credited to the explicit backer, then the
// markee-tagged createFlow (op 201 preserves the backer as the flow sender).
export function buildOpenStreamOps(p: OpenStreamParams): Operation[] {
  const wrap: Operation = {
    operationType: OP_SIMPLE_FORWARD_CALL,
    target: p.ethx,
    data: encodeFunctionData({ abi: ETHX_BATCH_ABI, functionName: 'upgradeByETHTo', args: [p.backer] }),
  }

  const permit: Operation = {
    operationType: OP_SIMPLE_FORWARD_CALL,
    target: p.ethx,
    data: encodeFunctionData({
      abi: ETHX_BATCH_ABI,
      functionName: 'permit',
      args: [p.backer, p.board, p.buffer, p.permit.deadline, p.permit.v, p.permit.r, p.permit.s],
    }),
  }

  const deposit: Operation = {
    operationType: OP_SIMPLE_FORWARD_CALL,
    target: p.board,
    data: encodeFunctionData({ abi: DEPOSIT_BUFFER_ABI, functionName: 'depositBuffer', args: [p.backer, p.buffer] }),
  }

  const callData = encodeFunctionData({
    abi: CFA_CREATE_FLOW_ABI,
    functionName: 'createFlow',
    args: [p.ethx, p.board, p.ratePerSec, '0x'],
  })
  const userData = encodeAbiParameters([{ type: 'address' }], [p.markee])

  const flow: Operation = {
    operationType: OP_CALL_AGREEMENT,
    target: p.cfaAgreement,
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [callData, userData]),
  }

  return [wrap, permit, deposit, flow]
}

// Native ETH to send with the batch: the buffer (pulled back into the board as the SuperApp deposit)
// plus the prefund the backer keeps as ETHx to sustain the stream over time.
export function openStreamValue(buffer: bigint, prefund: bigint): bigint {
  return buffer + prefund
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

export const ETHX_READ_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const
