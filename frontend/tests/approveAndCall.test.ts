import assert from 'node:assert/strict'
import test from 'node:test'
import type { Address, Hex } from 'viem'
import {
  approveAndCall, isBatchUnsupportedError, needsApproval, supportsAtomicBatch, BATCH_FAILED_MESSAGE,
  type ApproveAndCallDeps, type ApproveAndCallParams, type CallsOutcome, type ContractCall,
} from '../lib/tx/approveAndCall'

const ACCOUNT = '0x00000000000000000000000000000000000000aa' as Address
const TOKEN = '0x00000000000000000000000000000000000000bb' as Address
const SPENDER = '0x00000000000000000000000000000000000000cc' as Address
const HOST = '0x00000000000000000000000000000000000000dd' as Address
const ACTION_HASH = '0x01' as Hex
const APPROVE_HASH = '0x02' as Hex
const BATCH_HASH = '0x03' as Hex

const params: ApproveAndCallParams = {
  account: ACCOUNT, token: TOKEN, spender: SPENDER, amount: 100n,
  call: { address: HOST, abi: [], functionName: 'batchCall', args: [[]], value: 5n, chainId: 8453 },
}

function harness(opts: { allowance: bigint; atomic?: boolean | Error; calls?: CallsOutcome; approveStatus?: 'success' | 'reverted' }) {
  const log: string[] = []
  const writes: ContractCall[] = []
  let batched: ContractCall[] = []
  const deps: ApproveAndCallDeps = {
    readAllowance: async () => { log.push('allowance'); return opts.allowance },
    supportsAtomicBatch: async () => {
      log.push('capabilities')
      if (opts.atomic instanceof Error) throw opts.atomic
      return opts.atomic ?? false
    },
    write: async call => {
      writes.push(call)
      log.push(`write:${call.functionName}`)
      return call.functionName === 'approve' ? APPROVE_HASH : ACTION_HASH
    },
    waitForReceipt: async hash => { log.push(`receipt:${hash}`); return { status: opts.approveStatus ?? 'success' } },
    sendCalls: async (_account, _chainId, calls) => { batched = calls; log.push('sendCalls'); return 'batch-id' },
    waitForCalls: async () => { log.push('waitForCalls'); return opts.calls ?? { status: 'success', transactionHash: BATCH_HASH } },
    onApproving: () => log.push('approving'),
    onApproved: () => log.push('approved'),
  }
  return { deps, log, writes, batched: () => batched }
}

test('needsApproval only when a positive amount exceeds the allowance', () => {
  assert.equal(needsApproval(0n, 0n), false)
  assert.equal(needsApproval(100n, 100n), false)
  assert.equal(needsApproval(150n, 100n), false)
  assert.equal(needsApproval(99n, 100n), true)
})

test('atomic batching is detected from EIP-5792 capabilities', () => {
  assert.equal(supportsAtomicBatch({ atomic: { status: 'supported' } }), true)
  assert.equal(supportsAtomicBatch({ atomicBatch: { supported: true } }), true)
  assert.equal(supportsAtomicBatch({ atomic: { status: 'ready' } }), false)
  assert.equal(supportsAtomicBatch({ atomic: { status: 'unsupported' } }), false)
  assert.equal(supportsAtomicBatch({ atomicBatch: { supported: false } }), false)
  assert.equal(supportsAtomicBatch({}), false)
  assert.equal(supportsAtomicBatch(undefined), false)
})

test('an allowance that already covers the amount skips the approve entirely', async () => {
  const h = harness({ allowance: 100n, atomic: true })
  const result = await approveAndCall(params, h.deps)
  assert.deepEqual(result, { kind: 'submitted', hash: ACTION_HASH, mode: 'direct' })
  assert.deepEqual(h.log, ['allowance', 'write:batchCall'])
})

test('a zero amount never asks for an approval', async () => {
  const h = harness({ allowance: 0n, atomic: true })
  const result = await approveAndCall({ ...params, amount: 0n }, h.deps)
  assert.equal(result.kind, 'submitted')
  assert.deepEqual(h.log, ['allowance', 'write:batchCall'])
})

test('an atomic-capable wallet gets approve and action as one batch, approve first', async () => {
  const h = harness({ allowance: 0n, atomic: true })
  const result = await approveAndCall(params, h.deps)
  assert.deepEqual(result, { kind: 'submitted', hash: BATCH_HASH, mode: 'batch' })
  assert.deepEqual(h.log, ['allowance', 'capabilities', 'sendCalls', 'waitForCalls'])
  const [approve, action] = h.batched()
  assert.equal(approve.address, TOKEN)
  assert.equal(approve.functionName, 'approve')
  assert.deepEqual(approve.args, [SPENDER, 100n])
  assert.equal(action, params.call)
})

test('a batch still pending (a Safe proposal awaiting signers) is reported as proposed, not resent', async () => {
  const h = harness({ allowance: 0n, atomic: true, calls: { status: 'pending' } })
  const result = await approveAndCall(params, h.deps)
  assert.deepEqual(result, { kind: 'proposed', id: 'batch-id' })
  assert.equal(h.writes.length, 0)
  assert.equal(h.log.filter(l => l === 'sendCalls').length, 1)
})

test('a failed batch throws without falling back to separate transactions', async () => {
  const h = harness({ allowance: 0n, atomic: true, calls: { status: 'failure' } })
  await assert.rejects(approveAndCall(params, h.deps), { message: BATCH_FAILED_MESSAGE })
  assert.equal(h.writes.length, 0)
})

test('wallets without atomic batching fall back to approve, receipt, then action', async () => {
  const h = harness({ allowance: 10n, atomic: false })
  const result = await approveAndCall(params, h.deps)
  assert.deepEqual(result, { kind: 'submitted', hash: ACTION_HASH, mode: 'sequential' })
  assert.deepEqual(h.log, ['allowance', 'capabilities', 'approving', 'write:approve', `receipt:${APPROVE_HASH}`, 'approved', 'write:batchCall'])
})

test('a capability lookup that throws falls back to the two-step flow', async () => {
  const h = harness({ allowance: 0n, atomic: new Error('Method not supported') })
  const result = await approveAndCall(params, h.deps)
  assert.equal(result.kind, 'submitted')
  assert.deepEqual(h.writes.map(c => c.functionName), ['approve', 'batchCall'])
})

test('a reverted approval stops before the action', async () => {
  const h = harness({ allowance: 0n, approveStatus: 'reverted' })
  await assert.rejects(approveAndCall(params, h.deps), /approval transaction reverted/)
  assert.deepEqual(h.writes.map(c => c.functionName), ['approve'])
})

test('closing the flow after the approval does not send the action', async () => {
  const h = harness({ allowance: 0n })
  let active = true
  h.deps.waitForReceipt = async () => { active = false; return { status: 'success' } }
  const result = await approveAndCall(params, { ...h.deps, isActive: () => active })
  assert.deepEqual(result, { kind: 'aborted' })
  assert.deepEqual(h.writes.map(c => c.functionName), ['approve'])
})

test('a wallet that refuses wallet_sendCalls outright falls back to two transactions', async () => {
  const h = harness({ allowance: 0n, atomic: true })
  h.deps.sendCalls = async () => { throw Object.assign(new Error('wrapped'), { cause: { code: 5760 } }) }
  const result = await approveAndCall(params, h.deps)
  assert.deepEqual(result, { kind: 'submitted', hash: ACTION_HASH, mode: 'sequential' })
  assert.deepEqual(h.writes.map(c => c.functionName), ['approve', 'batchCall'])
})

test('a user rejecting the batch does not fall back to separate transactions', async () => {
  const h = harness({ allowance: 0n, atomic: true })
  h.deps.sendCalls = async () => { throw Object.assign(new Error('User rejected'), { code: 4001 }) }
  await assert.rejects(approveAndCall(params, h.deps), /User rejected/)
  assert.equal(h.writes.length, 0)
  assert.equal(isBatchUnsupportedError({ code: 4001 }), false)
  assert.equal(isBatchUnsupportedError({ code: -32601 }), true)
})
