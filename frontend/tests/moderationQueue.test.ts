import assert from 'node:assert/strict'
import test from 'node:test'
import { observeMessage, reviewItem, reviewMessage, type MessageObservation, type ModerationItem } from '../lib/moderation/queue'

const reviewer = '0x809C9f8dd8CA93A41c3adca4972Fa234C28F7714'

const fresh = { flagged: false, preexisting: false }

function obs(message: string, blockNumber = '100'): MessageObservation {
  return {
    markee: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    board: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    message,
    name: 'alice',
    author: '0xcccccccccccccccccccccccccccccccccccccccc',
    blockNumber,
    at: Number(blockNumber),
  }
}

test('a first sighting is queued as a new message', () => {
  const item = observeMessage(null, obs('gm'), fresh)!
  assert.equal(item.status, 'pending')
  assert.equal(item.kind, 'created')
  assert.equal(item.previousMessage, null)
})

test('a first sighting of an already flagged markee stays flagged', () => {
  assert.equal(observeMessage(null, obs('spam'), { flagged: true, preexisting: true })!.status, 'flagged')
})

test('text live before the queue existed starts approved', () => {
  const item = observeMessage(null, obs('gm'), { flagged: false, preexisting: true })!
  assert.equal(item.status, 'approved')
  assert.equal(item.reviewedBy, null)
})

test('editing pre-existing text after the baseline queues it', () => {
  const baseline = observeMessage(null, obs('gm'), { flagged: false, preexisting: true })!
  const edited = observeMessage(baseline, obs('gn', '200'), fresh)!
  assert.equal(edited.status, 'pending')
  assert.equal(edited.previousMessage, 'gm')
})

test('unchanged text is not re-queued', () => {
  const approved = reviewItem(observeMessage(null, obs('gm'), fresh)!, 'approve', reviewer, 1)
  assert.equal(observeMessage(approved, obs('gm', '200'), fresh), null)
})

test('editing approved text re-queues it with the approved text as the previous message', () => {
  const approved = reviewItem(observeMessage(null, obs('gm'), fresh)!, 'approve', reviewer, 1)
  const edited = observeMessage(approved, obs('gn', '200'), fresh)!
  assert.equal(edited.status, 'pending')
  assert.equal(edited.kind, 'edited')
  assert.equal(edited.previousMessage, 'gm')
  assert.equal(edited.reviewedBy, null)
})

test('editing flagged text re-queues it for review', () => {
  const flagged = reviewItem(observeMessage(null, obs('spam'), fresh)!, 'flag', reviewer, 1)
  const edited = observeMessage(flagged, obs('sorry', '200'), { flagged: true, preexisting: false })!
  assert.equal(edited.status, 'pending')
  assert.equal(edited.previousMessage, 'spam')
})

test('repeated edits before review keep the last reviewed text', () => {
  const approved = reviewItem(observeMessage(null, obs('v1'), fresh)!, 'approve', reviewer, 1)
  const once = observeMessage(approved, obs('v2', '200'), fresh)!
  const twice = observeMessage(once, obs('v3', '300'), fresh)!
  assert.equal(twice.previousMessage, 'v1')
  assert.equal(twice.kind, 'edited')
})

test('an unreviewed new message edited again is still a new message', () => {
  const created = observeMessage(null, obs('v1'), fresh)!
  const edited = observeMessage(created, obs('v2', '200'), fresh)!
  assert.equal(edited.kind, 'created')
  assert.equal(edited.previousMessage, null)
  assert.equal(edited.message, 'v2')
})

test('reviews record the lowercase reviewer', () => {
  const item: ModerationItem = observeMessage(null, obs('gm'), fresh)!
  const flagged = reviewItem(item, 'flag', reviewer, 42)
  assert.equal(flagged.status, 'flagged')
  assert.equal(flagged.reviewedBy, reviewer.toLowerCase())
  assert.equal(flagged.reviewedAt, 42)
  assert.equal(reviewItem(item, 'unflag', reviewer, 42).status, 'approved')
})

test('a single-id review message matches the original flag format', () => {
  assert.equal(reviewMessage('flag', 8453, ['0xabc'], 7), 'markee-moderation:flag:8453:0xabc:7')
  assert.equal(reviewMessage('approve', 8453, ['0xa', '0xb'], 7), 'markee-moderation:approve:8453:0xa,0xb:7')
})
