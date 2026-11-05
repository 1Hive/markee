# Automatic message moderation

The shared server-side checker is **enabled by default** when `FLAG_AUTO_MODERATION` is unset.
Set `FLAG_AUTO_MODERATION=false` explicitly to disable it (case and surrounding spaces are ignored).
Empty or unrecognized values keep moderation enabled.
No AI credentials, model server, or SDK integrator configuration is needed. Set this on the Markee
backend, never in a host app. Preview and production can be enabled independently.

The policy is `website-rules-v1+profanity-3.3.0-v1`: deterministic website rules plus pinned
`@2toad/profanity@3.3.0`. The dictionary checker checks message text only with all twelve packaged
dictionaries, Unicode-aware whole-word boundaries, and NFKC
normalization for matching. Hashes cover exact original UTF-8 text; the original message is never
rewritten. Names are still subject to manual moderation. This detects dictionary matches, not
general contextual threats or hate. The additional rules detect specific solicitation patterns, not
every scam. An engine interface allows a future OpenAI Moderation adapter.

## Package quality and limitations

Dictionary quality should be assessed with native-language fixtures. Tests found neutral translated
words in the Japanese and Korean lists (including
“login” and “shopping cart”) and missing common Japanese/Korean profanity. Whole-word matching
also has limitations in unsegmented scripts. All twelve lists are loaded as requested, but that
is not evidence of reliable coverage in twelve languages. Tests preserve these known limitations
rather than claiming they are successfully detected. Use the explicit opt-out if these limitations
are unsuitable for an environment.

## Website rules

One centrally managed policy applies to every enabled integration; there are no per-board settings
in this release. The shared draft, published, scanner, SDK snapshot and website-embed paths use it.

- `SECRET_REQUEST`: requests to send, enter, or disclose seed/recovery phrases or private keys.
- `CLAIM_SOLICITATION`: a reward/airdrop claim combined with a link or wallet-connection request.
- `PROMISED_RETURN`: a crypto-payment instruction promising a multiplied return.
- `PAYMENT_SOLICITATION`: payment instructions containing an EVM address (including abbreviated
  references) or an ENS target. ENS mentions/signatures alone are permitted; candidate names use
  ENSIP-15 normalization without on-chain resolution. This rule can also match legitimate donations:
  it describes a payment instruction, not proof of fraud.
- `SHORTENED_LINK`: an explicitly maintained list of common shortening domains, including bit.ly,
  t.co and tinyurl.com. Exact host/subdomain matching avoids matching domains such as notbit.ly.
- `DOMAIN_LOOKALIKE`: protected-service brand labels on a different domain, selected visual
  substitutions, prefixed brand labels, misleading subdomains and protected domains in URL userinfo.
  The initial protected domains are uniswap.org, metamask.io, coinbase.com, opensea.io, markee.xyz,
  and gardens.fund. This is a heuristic, not domain ownership or reputation verification.

Unknown ordinary links are allowed. No URL is fetched, redirected, or sent to a reputation service;
no new credentials or RPC reads are required for the rules. Contextual phrase rules are English
only in this version; multilingual profanity remains separate. These rules are not comprehensive
phishing, contextual-abuse or obfuscation detection. Original text is preserved; normalization is
used only for detection. Explicit safety advice such as “Never share your seed phrase” is allowed.

Verdicts include a human-readable reason and optional `reasonCodes` in addition to existing fields.
They are cached by exact message hash and policy version. Old indexed policy results are rechecked
from trusted current on-chain observations; failures remain unavailable, not implicitly passing.
Exact-text false-positive overrides survive policy updates. New approvals apply to Markee and SDK
integrations; legacy site-only approvals retain their original scope. Changing text still requires
a fresh verdict and never removes manual flags. Existing draft warnings retain Continue anyway.

GitHub README synchronization, model classification, approval-required mode and per-board policy
configuration are outside this release. Validate policy changes on staging before deploying them.

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
  At one pinned block, the board must be a canonical root or belong to a configured trusted
  factory, and the board must recognize the Markee through `isMarkeeOnLeaderboard`. A contract's
  claimed `pricingStrategy` or `factory` alone is never sufficient. Rejected identifiers return
  unavailable without creating soft flags. SDK overlays and edit-log scanner ingestion use the
  same membership boundary.
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
signature, and optional `scope` (`all` or legacy `site`; omitted means `site`). The signature binds
a canonical message containing the action, chain, identifier,
hash, timestamp, and exact scope. New UI approvals use v2 with `all`; v1 site signatures cannot
authorize all surfaces. Existing board moderators/owners and global admins are eligible.
The server re-reads the current revision before persisting an exception. It never clears manual
flags. Exceptions are per Markee and exact text, persist across engine updates, and new `all` approvals restore both
Markee-site and SDK visibility. Legacy site-only approvals remain listed with “Approve for SDK too”
so moderators can explicitly extend them with a fresh signature. SDK response shapes are unchanged;
existing clients receive `moderated: false` for approved text.

Queue **Approve** uses the same exact-text visibility override and also settles the moderator's
pending review scopes atomically. It sends `intent: 'approve'` and `scope: 'all'`, signed with
`markee-moderation:approve:v1` binding the chain, identifier, text hash, scope and timestamp.
The server checks both current on-chain text and the queued revision; changed text requires
refreshing and signing again. Passing messages can also be explicitly approved. Legacy approvals
through `POST /api/moderation` keep their original review-only behavior because those signatures
do not bind text and cannot safely authorize an automatic-moderation override.

Soft/unavailable indexes are separate from manual sets. The existing scanner reconciles on-chain
edits, including transactions outside the UI. Unfiltered legacy flag lists include the index and
may lag edits until scanning; updated clients use content-aware checks. The flagged queue labels
automatic entries and shows the dedicated false-positive action. Views are rejected when the
published content is hidden or cannot be verified.

Queue reads revalidate persisted rows, including rows created before membership validation was
introduced. Definitively rejected soft-index records are removed; uncertain RPC results preserve
the records and make flag-list reads unavailable rather than return a partial passing list.
Legacy embed responses recheck moderation independently of their display cache and blank both
message and author when verification fails. Existing external embeds must also hide content on
non-200 or invalid flag-list responses; updating Markee cannot rewrite already-deployed embeds.

View POST bodies are bounded to 16 KiB with validated addresses, messages (4096 UTF-8 bytes), and
optional URLs (2048 characters). When automatic moderation is enabled, a dedicated per-IP limit
allows 120 requests per minute. Origin checks and the existing hourly view dedupe run before
moderation RPC or persistence. Rejected origins and duplicates retain the existing
`{totalViews, messageViews, counted:false}` response.
