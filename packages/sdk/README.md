# Markee SDK

Embed a Markee leaderboard, payment modal, or live sign in a React or plain JavaScript app. The SDK reads the board's For Sale or For Rent strategy from Markee and uses `https://www.markee.xyz/api/sdk/v1` by default.

## Install

```sh
npm install @markee_team/sdk@latest
```

Commit your app's lockfile. React 18 or 19 is needed only for the React entry point.

Create a leaderboard at [Markee](https://www.markee.xyz/create-a-markee), or use an existing one. Copy its page URL and use the address after `/markee/` as your placement:

```ts
const placement = {
  kind: 'board',
  chainId: 8453,
  address: '0xYOUR_BOARD_ADDRESS',
} as const;
```

The SDK connects to the board; installing it does not create one. It selects the payment flow from the board's strategy.

## Plain JavaScript

```ts
import { createMarkee } from '@markee_team/sdk';

const markee = createMarkee({
  // Optional: reuse your app's selected EIP-1193 wallet.
  wallet: {
    getProvider: async () => appWalletProvider ?? null,
    connect: async () => connectAppWallet(),
  },
  onEvent: event => {
    if (event.type === 'confirmed') refreshYourApp();
  },
});

markee.open({ placement });
// markee.close();
```

Omit `wallet` to let the modal discover browser wallets. It can also offer Markee-hosted checkout on eligible boards when that feature is available.

## React

```tsx
import { MarkeeModal, MarkeeSign } from '@markee_team/sdk/react';

<MarkeeSign placement={placement} onOpen={() => setOpen(true)} />
<MarkeeModal
  open={open}
  onClose={() => setOpen(false)}
  placement={placement}
  wallet={walletAdapter}
  onEvent={event => {
    if (event.type === 'confirmed') refreshYourApp();
  }}
/>
```

`MarkeeSign` shows the current winner and opens the modal by default. Pass `onOpen` to control a separate modal, or `showAction={false}` for a display-only sign. In plain JavaScript, use `createMarkeeSign(container, { placement })`; it returns `refresh()`, `setTheme()`, and `destroy()`. See the [ConnectKit adapter example](https://github.com/1Hive/markee/tree/main/examples/connectkit) for wallet reuse.

## Match your app's theme

Pass `theme` to `createMarkee`, `MarkeeModal`, or `MarkeeSign`:

```ts
const theme = {
  mode: 'system',
  fontFamily: '"DM Sans", system-ui, sans-serif',
  radius: 16,
  cardRadius: 12,
  controlRadius: 8,
  colors: {
    primary: '#743a84',
    primaryText: '#ffffff',
    accent: '#eac6f1',
    accentText: '#50265b',
  },
} as const;
```

`mode` accepts `light`, `dark`, or `system`. Colors and radii are optional; see the exported `MarkeeTheme` type for all tokens. The JavaScript modal also supports `markee.setTheme(theme)`.

## Show your app under “Served on”

Pass your public page URL as `siteUrl` to `MarkeeModal` or `createMarkee`. React registers when mounted; plain JavaScript registers when the modal opens. Use `onSiteVerification` to inspect the result.

Markee checks the returned HTML for your board marker. Server-rendered React integrations add it automatically. For a client-rendered app, add this to its deployed HTML:

```html
<span hidden data-markee-address="0xYOUR_BOARD_ADDRESS"></span>
```

The marker must be in the HTML response, not inserted later by JavaScript. Use a public HTTPS URL on your app's origin that serves the final page without redirects. Site verification is currently available for Base boards and does not block the modal. To retry, call `new MarkeeClient().verifySite(placement, siteUrl)`.

## Payments and recovery

- For Sale uses one-time ETH payments. For Rent uses ETHx streams. The modal prepares each action with Markee, shows a review, and asks for wallet confirmation. An expired review requires a fresh confirmation.
- When a wallet reports EIP-5792 atomic support, `submit(preparation)` can send an atomic batch. Other wallets use a direct transaction. `send(preparation)` retains its direct transaction and hash-return behavior.
- The SDK saves a recovery record before opening a wallet prompt. Accepted batch IDs and transaction hashes remain recoverable after reload. Ambiguous wallet responses block another payment until the existing operation is checked; the SDK never automatically resubmits it.
- `pendingOperation(placement, account)` and `verifyOperation(operation)` resume verification. A `confirmed` event means Markee verified the payment. A wallet batch ID alone is not a confirmed payment or a transaction hash.
- Older pending records, including records created against the former staging API default, remain readable.

When hosted checkout is available for an eligible Base For Sale board, a user without an app wallet can pay on Markee. Card funding alone is not a confirmed payment; the host receives `confirmed` after Markee verifies the transaction. For Rent requires a wallet. To always open hosted checkout in the same tab, set `checkoutWindow: 'redirect'`.

## Other placements

Existing `gardens-community` placements remain supported. For a registered platform with multiple communities, use `multiBoard` instead of `placement`:

```tsx
const multiBoard = {
  platformId: 'revnet',
  chainId: project.chainId,
  communityId: String(project.id),
};

<MarkeeSign multiBoard={multiBoard} onOpen={() => setOpen(true)} />
<MarkeeModal multiBoard={multiBoard} open={open} onClose={() => setOpen(false)} />
```

Supply exactly one of `placement` or `multiBoard`. Platform activation is available only when Markee enables it and the connected account is authorized; an unactivated community may have no board to display.

## Moderation

The sign withholds flagged or unavailable messages. The modal can warn about draft messages when Markee's automatic checks are enabled. To choose optional rules, pass `moderation` to the modal, sign, `createMarkee`, or `MarkeeClient`:

```ts
const moderation = {
  version: 1,
  rules: { profanity: true, links: false, addresses: false, ens: true },
} as const;
```

Scam and phishing checks always run. The existing `severity: 'relaxed' | 'standard' | 'strict'` presets remain supported; explicit rules override the selected preset. Treat an unavailable moderation result as unknown.

## Headless client and API

`MarkeeClient` exposes `snapshot`, `prepare`, `send`, `submit`, `verify`, `pendingOperation`, `verifyOperation`, and other board actions. Read the exported TypeScript types for request and response details. Financial inputs are decimal wei strings; `parseEth` converts user-entered ETH amounts.

The default endpoint is `https://www.markee.xyz/api/sdk/v1`. Override `apiUrl` only for an explicit staging or local environment. Saved operations stay bound to the API origin that created them.

For backend behavior and the full API reference, see [SDK implementation](https://github.com/1Hive/markee/blob/main/docs/sdk/implementation.md).

## Coding assistant prompt

```text
Install @markee_team/sdk@latest and read its installed README and types.
Inspect this app's framework, wallet connector, and theme before integrating.
Ask me for my Markee page URL, or direct me to
https://www.markee.xyz/create-a-markee if I need a leaderboard.
Use its /markee/<address> address as a Base board placement. Verify the
board with MarkeeClient.snapshot; never silently use a demo board.
Use MarkeeModal for React or createMarkee for plain JavaScript. Reuse the
app's existing wallet when present. Match its colors, font, radii, and
light/dark behavior through SDK theme options. Ask only for missing
placement, opening, and post-confirmation behavior.
Use siteUrl for the public page and add the board marker to server-returned
HTML when needed. Treat only confirmed events as verified payments.
Commit the lockfile, run the app's build and typecheck, and report what was
verified. Do not sign or send a transaction in automated checks.
```
