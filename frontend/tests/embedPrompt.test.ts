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
