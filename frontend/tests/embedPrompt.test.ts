import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UI_COPY, buildEmbedPrompt, type EmbedStrategy, type EmbedWallet } from '../lib/embedPrompt/fragments'

const root = join(__dirname, '..')

// JSX text escapes apostrophes (&apos;) and a label can be split across a {' '} boundary; normalize
// both so a label only "disappears" when its wording actually changed.
function normalizedSource(file: string): string {
  return readFileSync(join(root, file), 'utf8').replace(/&apos;/g, "'").replace(/\{' '\}/g, ' ')
}

for (const [group, { file, ...labels }] of Object.entries(UI_COPY)) {
  test(`embed prompt copy still matches ${file}`, () => {
    const source = normalizedSource(file)
    const missing = Object.entries(labels).filter(([, label]) => !source.includes(label))
    assert.deepEqual(
      missing, [],
      `UI_COPY.${group} has labels no longer found in ${file} -- update the prompt to match the modal's new copy`,
    )
  })
}

const address = '0x0000000000000000000000000000000000000001'
const strategies: EmbedStrategy[] = ['fixed', 'streaming']
const wallets: EmbedWallet[] = ['privy', 'rainbowkit', 'other', 'none']

for (const strategy of strategies) {
  test(`${strategy} prompt describes markee.xyz's modal, not the old layouts`, () => {
    const prompt = buildEmbedPrompt({ address, strategy, framework: 'nextjs', wallet: 'none', agent: 'claude-code' })
    assert.ok(prompt.includes(UI_COPY.fixedModal.existingDivider))
    assert.ok(prompt.includes(UI_COPY.fixedModal.review))
    assert.ok(!prompt.includes('Switch & Fund'), 'old radio-list streaming layout')
    assert.ok(!prompt.includes('to back'), 'pill copy is "to rent" on markee.xyz')
    assert.ok(!prompt.includes('BuyMessageModal'), 'stale reference implementation')
    assert.ok(!/\[object Object\]|\bNaN\b|: undefined\b/.test(prompt), 'bad interpolation')
  })
}

test('"None yet" wallet setup needs no third-party account', () => {
  const prompt = buildEmbedPrompt({ address, strategy: 'fixed', framework: 'nextjs', wallet: 'none', agent: 'claude-code' })
  assert.ok(prompt.includes('coinbaseWallet('))
  assert.ok(prompt.includes('injected()'))
  assert.ok(!prompt.includes('@privy-io'))
  assert.ok(!prompt.includes('NEXT_PUBLIC_PRIVY_APP_ID'))
})

test('every wallet/strategy combination renders', () => {
  for (const strategy of strategies) {
    for (const wallet of wallets) {
      const prompt = buildEmbedPrompt({ address, strategy, framework: 'react', wallet, agent: 'other' })
      assert.ok(prompt.length > 5_000)
    }
  }
})
