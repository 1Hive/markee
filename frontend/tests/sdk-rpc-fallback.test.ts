import assert from 'node:assert/strict'
import test from 'node:test'
import { createPublicClient } from 'viem'
import { base } from 'viem/chains'
import { getRpcTransportForChain } from '../lib/sdk/chains'

test('Base reads fall back when the configured RPC rejects requests', async () => {
  const previousUrl = process.env.MARKEE_RPC_8453
  const previousFetch = globalThis.fetch
  const calls: string[] = []
  process.env.MARKEE_RPC_8453 = 'https://rpc.example.invalid'
  globalThis.fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (url === 'https://rpc.example.invalid/') return new Response('Forbidden', { status: 403 })
    assert.equal(url, 'https://mainnet.base.org/')
    return Response.json({ jsonrpc: '2.0', id: 1, result: '0x1234' })
  }

  try {
    const client = createPublicClient({ chain: base, transport: getRpcTransportForChain(base.id) })
    assert.equal(await client.getBlockNumber(), 0x1234n)
    assert.deepEqual(calls, ['https://rpc.example.invalid/', 'https://mainnet.base.org/'])
  } finally {
    globalThis.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.MARKEE_RPC_8453
    else process.env.MARKEE_RPC_8453 = previousUrl
  }
})
