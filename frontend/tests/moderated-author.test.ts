import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { matchesPublishedRevision } from '../hooks/usePublishedModeration'
import React, { createElement as h, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModeratedAuthor } from '../components/moderation/ModeratedContent'
import { ModerationContext } from '../components/moderation/ModerationProvider'

// The test runner compiles component JSX with the classic runtime.
(globalThis as { React?: typeof React }).React = React

const markeeId = '0x1111111111111111111111111111111111111111'
type Context = Parameters<typeof ModerationContext.Provider>[0]['value']
const base: Context = {
  autoModerationEnabled: false, flaggedSet: new Set(), isAdmin: false, canModerate: () => false, isFlagged: () => false,
  isHidden: () => false, canUnflag: () => false, toggleFlag: async () => false, replaceFlagged: () => {}, isLoading: false,
}
function render(context: Partial<Context>, props: { message?: string; children: ReactNode }) {
  return renderToStaticMarkup(h(QueryClientProvider, { client: new QueryClient() },
    h(ModerationContext.Provider, { value: { ...base, ...context } }, h(ModeratedAuthor, { chainId: 8453, markeeId, ...props }))))
}
const blurred = (html: string) => html.includes('blur(') && html.includes('aria-hidden="true"') && html.includes('hidden</span>')

// Author names are moderated with their message, as SDK signs hide both.
test('author labels show when their Markee is not flagged', () => {
  for (const children of ['Gossman', '0x07AD…38c6']) assert.equal(render({}, { message: 'Hello', children }), children)
})
test('a flagged Markee blurs its author label for viewers, but not for its moderators', () => {
  const flagged = { isFlagged: () => true }
  assert.ok(blurred(render(flagged, { message: 'Hello', children: 'Gossman' })))
  assert.equal(render({ ...flagged, canModerate: () => true }, { message: 'Hello', children: 'Gossman' }), 'Gossman')
  // A past name in board history has no message to judge; a moderator flag still applies.
  assert.ok(blurred(render(flagged, { children: 'Gossman' })))
  assert.equal(render({}, { children: 'Gossman' }), 'Gossman')
})
test('until automatic moderation has a verdict, the author label stays blurred', () => {
  assert.ok(blurred(render({ autoModerationEnabled: true }, { message: 'Hello', children: 'Gossman' })))
  assert.ok(blurred(render({ autoModerationEnabled: null }, { message: 'Hello', children: 'Gossman' })))
})


test('a name-only edit requires a verdict for the new name even when the message hash matches', async () => {
  const hash = (text: string) => createHash('sha256').update(text).digest('hex')
  const verdict = { contentHash: hash('Hello'), nameHash: hash('Original name') }
  assert.equal(await matchesPublishedRevision(verdict, 'Hello', 'Original name'), true)
  assert.equal(await matchesPublishedRevision(verdict, 'Hello', 'Edited name'), false)
  assert.equal(await matchesPublishedRevision({ contentHash: verdict.contentHash }, 'Hello', 'Edited name'), false)
  assert.equal(await matchesPublishedRevision(verdict, 'Hello'), true)
})
