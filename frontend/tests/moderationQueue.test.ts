import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isFlaggedIn, isPendingIn, moderatorsMessage, normalizeItem, normalizeModerators, observeMessage, reviewItem, reviewMessage,
  type MessageObservation, type ModerationItem, type ModerationScope,
} from '../lib/moderation/queue'

const reviewer = '0x809C9f8dd8CA93A41c3adca4972Fa234C28F7714'
const BOTH: ModerationScope[] = ['board', 'site']

const unflagged = { board: false, site: false }
const fresh = { flagged: unflagged, preexisting: false }

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

const statuses = (item: ModerationItem) => [item.reviews.board.status, item.reviews.site.status]

test('a first sighting is queued as a new message in both scopes', () => {
  const item = observeMessage(null, obs('gm'), fresh)!
  assert.deepEqual(statuses(item), ['pending', 'pending'])
  assert.equal(item.kind, 'created')
  assert.equal(item.previousMessage, null)
})

test('a first sighting keeps each scope\'s existing flag', () => {
  const item = observeMessage(null, obs('spam'), { flagged: { board: false, site: true }, preexisting: true })!
  assert.deepEqual(statuses(item), ['approved', 'flagged'])
})

test('text live before the queue existed starts approved', () => {
  const item = observeMessage(null, obs('gm'), { flagged: unflagged, preexisting: true })!
  assert.deepEqual(statuses(item), ['approved', 'approved'])
  assert.equal(item.reviews.board.reviewedBy, null)
})

test('editing pre-existing text after the baseline queues it', () => {
  const baseline = observeMessage(null, obs('gm'), { flagged: unflagged, preexisting: true })!
  const edited = observeMessage(baseline, obs('gn', '200'), fresh)!
  assert.deepEqual(statuses(edited), ['pending', 'pending'])
  assert.equal(edited.previousMessage, 'gm')
})

test('unchanged text is not re-queued', () => {
  const approved = reviewItem(observeMessage(null, obs('gm'), fresh)!, 'approve', reviewer, 1, BOTH)
  assert.equal(observeMessage(approved, obs('gm', '200'), fresh), null)
})

test('editing approved text re-queues it with the approved text as the previous message', () => {
  const approved = reviewItem(observeMessage(null, obs('gm'), fresh)!, 'approve', reviewer, 1, BOTH)
  const edited = observeMessage(approved, obs('gn', '200'), fresh)!
  assert.deepEqual(statuses(edited), ['pending', 'pending'])
  assert.equal(edited.kind, 'edited')
  assert.equal(edited.previousMessage, 'gm')
  assert.equal(edited.reviews.board.reviewedBy, null)
})

test('editing flagged text re-queues it for review', () => {
  const flagged = reviewItem(observeMessage(null, obs('spam'), fresh)!, 'flag', reviewer, 1, BOTH)
  const edited = observeMessage(flagged, obs('sorry', '200'), { flagged: { board: true, site: true }, preexisting: false })!
  assert.deepEqual(statuses(edited), ['pending', 'pending'])
  assert.equal(edited.previousMessage, 'spam')
})

test('repeated edits before review keep the last reviewed text', () => {
  const approved = reviewItem(observeMessage(null, obs('v1'), fresh)!, 'approve', reviewer, 1, BOTH)
  const once = observeMessage(approved, obs('v2', '200'), fresh)!
  const twice = observeMessage(once, obs('v3', '300'), fresh)!
  assert.equal(twice.previousMessage, 'v1')
  assert.equal(twice.kind, 'edited')
})

test('an edit still owed a review in one scope keeps the last fully reviewed text', () => {
  const approved = reviewItem(observeMessage(null, obs('v1'), fresh)!, 'approve', reviewer, 1, BOTH)
  const once = reviewItem(observeMessage(approved, obs('v2', '200'), fresh)!, 'approve', reviewer, 2, ['board'])
  const twice = observeMessage(once, obs('v3', '300'), fresh)!
  assert.equal(twice.previousMessage, 'v1')
})

test('an unreviewed new message edited again is still a new message', () => {
  const created = observeMessage(null, obs('v1'), fresh)!
  const edited = observeMessage(created, obs('v2', '200'), fresh)!
  assert.equal(edited.kind, 'created')
  assert.equal(edited.previousMessage, null)
  assert.equal(edited.message, 'v2')
})

test('a review only touches the reviewer\'s scopes', () => {
  const item = observeMessage(null, obs('gm'), fresh)!
  const siteFlagged = reviewItem(item, 'flag', reviewer, 42, ['site'])
  assert.deepEqual(statuses(siteFlagged), ['pending', 'flagged'])
  assert.ok(isPendingIn(siteFlagged, ['board']))
  assert.ok(!isPendingIn(siteFlagged, ['site']))
  assert.ok(isFlaggedIn(siteFlagged, ['site']))
  assert.ok(!isFlaggedIn(siteFlagged, ['board']))
})

test('reviews record the lowercase reviewer', () => {
  const item: ModerationItem = observeMessage(null, obs('gm'), fresh)!
  const flagged = reviewItem(item, 'flag', reviewer, 42, ['board'])
  assert.equal(flagged.reviews.board.status, 'flagged')
  assert.equal(flagged.reviews.board.reviewedBy, reviewer.toLowerCase())
  assert.equal(flagged.reviews.board.reviewedAt, 42)
  assert.equal(reviewItem(item, 'unflag', reviewer, 42, ['board']).reviews.board.status, 'approved')
})

test('items stored before scopes get the same review in both', () => {
  const legacy = { ...obs('gm'), kind: 'created', previousMessage: null, status: 'flagged', reviewedBy: '0xabc', reviewedAt: 5 }
  const item = normalizeItem(legacy as unknown as ModerationItem)!
  assert.deepEqual(statuses(item), ['flagged', 'flagged'])
  assert.equal(item.reviews.site.reviewedBy, '0xabc')
})

test('a single-id review message matches the original flag format', () => {
  assert.equal(reviewMessage('flag', 8453, ['0xabc'], 7), 'markee-moderation:flag:8453:0xabc:7')
  assert.equal(reviewMessage('approve', 8453, ['0xa', '0xb'], 7), 'markee-moderation:approve:8453:0xa,0xb:7')
})

test('the moderator list is signed in a canonical order', () => {
  const list = normalizeModerators([' 0xBB ', '0xaa', '0xbb'])
  assert.deepEqual(list, ['0xaa', '0xbb'])
  assert.equal(moderatorsMessage(8453, '0xBoard', list, 7), 'markee-moderation:moderators:8453:0xboard:0xaa,0xbb:7')
})
