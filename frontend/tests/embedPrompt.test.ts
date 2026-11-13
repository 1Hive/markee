import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEmbedPrompt, moderationFragment, moderationOptionSource, SDK_RULES_VERSION, type EmbedStrategy, type EmbedWallet } from '../lib/embedPrompt/fragments'

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
  assert.ok(prompt.includes('Try to match the app’s existing theme as closely as possible'))
  assert.ok(prompt.includes('CSS variables, Tailwind configuration'))
  assert.ok(prompt.includes('for both the sign and modal'))
  assert.ok(prompt.includes('createMarkeeSign and createMarkee'))
  assert.ok(prompt.includes('click Verify Site'))
  assert.ok(prompt.includes('Site verification confirms the public HTML marker'))
  assert.ok(!prompt.includes('undefined'))
  assert.equal(prompt, buildEmbedPrompt({ address, name: 'Existing board', strategy: 'fixed', framework: 'nextjs', wallet: 'none', agent: 'codex' }))
})


test('legacy moderation instructions hide content until a trustworthy flag list is available', () => {
  const prompt = moderationFragment()
  assert.ok(prompt.includes('useState<Set<string> | null>(null)'))
  assert.ok(prompt.includes('status: 503'))
  assert.ok(prompt.includes('flagged === null'))
  assert.ok(prompt.includes('do not record views'))
  assert.ok(!prompt.includes('flagged: []'))
})

test('selected severity is an answered requirement applied to React, vanilla and direct client integrations', () => {
  for (const severity of ['relaxed', 'standard', 'strict'] as const) {
    const prompt = buildEmbedPrompt({ address, strategy: 'fixed', severity })
    const source = moderationOptionSource(severity)
    assert.ok(prompt.includes(`moderation = ${source}`))
    assert.ok(prompt.includes(`new MarkeeClient({ moderation: ${source} }).snapshot(placement)`))
    assert.ok(prompt.includes('on both the sign and modal and on any MarkeeClient instance'))
    assert.ok(prompt.includes('pass it to both createMarkeeSign and createMarkee'))
    assert.ok(prompt.includes('do not ask me to choose it again'))
    assert.ok(prompt.includes('Manual flags and unavailable-state hiding still apply'))
  }
  assert.equal(buildEmbedPrompt({ address, strategy: 'fixed' }), buildEmbedPrompt({ address, strategy: 'fixed', severity: 'standard' }))
})

test('individually selected rules emit the versioned policy object', () => {
  const off = { profanity: false, links: false, addresses: false, ens: false }
  // Toggles that match a preset produce exactly the same policy object.
  assert.equal(buildEmbedPrompt({ address, strategy: 'fixed', rules: { ...off, profanity: true } }), buildEmbedPrompt({ address, strategy: 'fixed', severity: 'standard' }))
  assert.equal(buildEmbedPrompt({ address, strategy: 'fixed', rules: off }), buildEmbedPrompt({ address, strategy: 'fixed', severity: 'relaxed' }))
  assert.equal(buildEmbedPrompt({ address, strategy: 'fixed', rules: { profanity: true, links: true, addresses: true, ens: true } }), buildEmbedPrompt({ address, strategy: 'fixed', severity: 'strict' }))

  const prompt = buildEmbedPrompt({ address, strategy: 'fixed', rules: { ...off, profanity: true, ens: true } })
  const rules = '{ version: 1, rules: { profanity: true, links: false, addresses: false, ens: true } }'
  assert.ok(prompt.includes(`moderation = ${rules}`))
  assert.ok(prompt.includes(`new MarkeeClient({ moderation: ${rules} }).snapshot(placement)`))
  assert.ok(prompt.includes('messages with profanity, ENS names are also blocked'))
  assert.ok(prompt.includes('Allowed: links and domains, wallet and contract addresses.'))
  assert.ok(prompt.includes(`@markee_team/sdk ${SDK_RULES_VERSION} or later`))
  assert.ok(prompt.includes('Keep this exact rule selection'))
  assert.ok(prompt.includes('saved policy for this board takes precedence'))
})
