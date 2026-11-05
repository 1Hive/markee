import assert from 'node:assert/strict'
import test from 'node:test'
import { ModeratedAuthor } from '../components/moderation/ModeratedContent'

// No moderation provider is needed: names are independent of the message verdict.
// Keep legacy props accepted for existing author labels throughout the app.
test('author labels remain visible independently of message text or moderation availability', () => {
  for (const message of ['Hello', 'shit', undefined]) {
    for (const children of ['Gossman', '0x07AD…38c6', '']) {
      assert.equal(ModeratedAuthor({ chainId: 8453, markeeId: '0x1111111111111111111111111111111111111111', message, children }), children)
    }
  }
})
