import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEmbedPrompt, type EmbedStrategy, type EmbedWallet } from '../lib/embedPrompt/fragments'

const address = '0x0000000000000000000000000000000000000001'
for (const strategy of ['fixed', 'streaming'] as EmbedStrategy[]) {
  for (const wallet of ['privy', 'rainbowkit', 'other', 'none'] as EmbedWallet[]) {
    test(`SDK prompt for ${strategy} with ${wallet}`, () => {
      const prompt = buildEmbedPrompt({ address, strategy, wallet, framework: 'nextjs', agent: 'codex' })
      assert.ok(prompt.includes('@markee_team/sdk@latest'))
      assert.ok(prompt.includes(`https://www.markee.xyz/markee/${address}`))
      assert.ok(prompt.includes('API determines For Sale or For Rent automatically'))
      assert.ok(prompt.includes('data-markee-address='))
      assert.ok(prompt.includes('cardRadius'))
      assert.ok(prompt.includes('Do not request API keys'))
      assert.ok(!prompt.includes('writeContract'))
      assert.ok(!prompt.includes('coinbaseWallet('))
      assert.ok(!prompt.includes('/api/markee/moderation/route.ts'))
      if (wallet === 'none') assert.ok(prompt.includes('For Rent requires a wallet'))
    })
  }
}

test('wizard prompt needs no framework, wallet, or agent selection and follows deployment flow', () => {
  const prompt = buildEmbedPrompt({ address, name: 'Existing board', strategy: 'fixed' })
  assert.ok(prompt.includes('Detect React/Next.js versus vanilla JavaScript'))
  assert.ok(prompt.includes('Detect the existing wallet library'))
  assert.ok(prompt.includes('createMarkeeSign and createMarkee'))
  assert.ok(prompt.includes('click Verify Site'))
  assert.ok(prompt.includes('Site verification confirms the public HTML marker'))
  assert.ok(!prompt.includes('undefined'))
  assert.equal(prompt, buildEmbedPrompt({ address, name: 'Existing board', strategy: 'fixed', framework: 'nextjs', wallet: 'none', agent: 'codex' }))
})
