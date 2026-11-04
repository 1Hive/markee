# Automatic message moderation

`FLAG_AUTO_MODERATION=true` enables the shared server-side checker. It is **off by default**.
No AI credentials, model server, or SDK integrator configuration is needed. Set this on the Markee
backend, never in a host app. Preview and production can be enabled independently.

The first engine is pinned `@2toad/profanity@3.3.0`, policy `profanity-3.3.0-v1`. It checks message
text only with all twelve packaged dictionaries, Unicode-aware whole-word boundaries, and NFKC
normalization for matching. Hashes cover exact original UTF-8 text; the original message is never
rewritten. Names are still subject to manual moderation. This detects dictionary matches, not
contextual threats, scams, or hate. An engine interface allows a future OpenAI Moderation adapter.

## Package quality and rollout gate

Do not enable this in production until the dictionaries have been reviewed with native-language
fixtures. Tests found neutral translated words in the Japanese and Korean lists (including
“login” and “shopping cart”) and missing common Japanese/Korean profanity. Whole-word matching
also has limitations in unsegmented scripts. All twelve lists are loaded as requested, but that
is not evidence of reliable coverage in twelve languages. Tests preserve these known limitations
rather than claiming they are successfully detected. No automatic rollout is configured.

## Public interfaces

- `POST /api/moderation/check`, `{kind:'draft', message}`: returns `enabled`, `state` (`pass`,
  `soft-flagged`, `unavailable`), `contentHash`, `engine`, `policyVersion`, and an optional reason.
  It does not persist a published flag. Draft bodies are limited to 4096 UTF-8 bytes.
- The same draft operation is available through `/api/sdk/v1/moderation/check` and
  `MarkeeClient.checkMessage(message)`. Older servers returning 404 mean the optional feature
  is disabled. Missing flags do not enable it.
- Published mode: `{kind:'published',chainId:8453,markeeIds:[...]}` accepts up to 50 identifiers,
  reads their messages and boards on-chain server-side, and returns `items` with effective
  `state` for integrations and `siteState` for Markee. Client-supplied published text is not trusted.
- SDK snapshots add optional `autoModerationEnabled` and `Entry.moderation`. Existing
  `Entry.moderated` remains false/true/null for visible/hidden/unavailable. Financial snapshots
  do not cache the moderation overlay. Prepared create/edit reviews can include advisory
  `review.moderation`. This is additive to v1 and alpha.22 clients continue hiding flagged text.

## Lifecycle and moderator permissions

Applicable manual flags win. Otherwise a failing automatic check soft-flags the exact message.
A passing edit restores it on the next status refresh; it never removes a manual flag. Engine
or storage failures produce unavailable and hide unverified content. No financial transaction is
submitted automatically. Draft warnings offer Edit message, Retry, and Continue anyway.

`POST /api/moderation/false-positive` accepts chainId, markee, contentHash, timestamp, moderator,
and signature. The signature binds a canonical message containing the action, chain, identifier,
hash, timestamp, and site scope. Existing board moderators/owners and global admins are eligible.
The server re-reads the current revision before persisting an exception. It never clears manual
flags. Exceptions are per Markee and exact text, persist across engine updates, and restore only
Markee-site visibility; SDK integrations continue hiding the automatically flagged message.

Soft/unavailable indexes are separate from manual sets. The existing scanner reconciles on-chain
edits, including transactions outside the UI. Unfiltered legacy flag lists include the index and
may lag edits until scanning; updated clients use content-aware checks. The flagged queue labels
automatic entries and shows the dedicated false-positive action. Views are rejected when the
published content is hidden or cannot be verified.
