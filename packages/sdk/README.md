# Markee SDK

An ESM JavaScript SDK with a self-contained, Shadow DOM modal and an optional React entry point. The SDK knows the Markee API endpoint; the host only supplies its placement and, optionally, its current wallet provider. No Alchemy, Redis, Privy, or bridge-provider key belongs in the consuming app.

Embed a Markee leaderboard in your app with wallet-funded For Sale and For Rent flows, automatic strategy detection, and a configurable theme. Hosted card checkout and incoming cross-chain funding are not included.

## Installation

```sh
npm install @markee_team/sdk@latest
```

Use React 18 or 19 for the optional React entry point. The plain JavaScript entry point does not require React. Both TypeScript bundler and NodeNext resolution are supported.

To build from the source repository:

```sh
npm ci --prefix packages/sdk
npm run build --prefix packages/sdk
```

## Create and connect your leaderboard

The SDK connects to an existing leaderboard; installing it does not create one.

1. Open [Create a Markee](https://www.markee.xyz/create-a-markee) and complete the leaderboard setup on Markee. Choose For Sale or For Rent there. If you already have a leaderboard, use it instead.
2. Copy the resulting Markee page link: `https://www.markee.xyz/markee/<address>`.
3. Extract the `0x…` address from that link and use it in the SDK placement: `{ kind: 'board', chainId: 8453, address: yourLeaderboardAddress }`.
4. Open the modal to display your leaderboard. If using a coding assistant, give it the Markee page link along with the LLM implementation prompt below.

The SDK reads the leaderboard's strategy from Markee and automatically renders the appropriate For Sale or For Rent flow. You do not configure a strategy in your app.

## Plain JavaScript

```ts
import { createMarkee } from '@markee_team/sdk';

const markee = createMarkee({
  // Optional. Reuse the wallet selected by your application's wallet connector.
  wallet: {
    getProvider: async () => appWalletProvider ?? null,
    connect: async () => connectAppWallet(),
  },
  onEvent: event => console.log(event.type, event.hash),
});

markee.open({
  placement: {
    kind: 'board',
    chainId: 8453,
    address: '0x2768BC6e90266248BD8bCF5401C36D8049CdF671',
  },
});

// markee.close();
```

Without a wallet adapter, browsing works without a wallet. On a connect click the modal discovers installed wallets using EIP-6963, with an EIP-1193 fallback. Multiple discovered wallets are offered for explicit selection. An adapter always takes precedence over injected discovery. Hosted login and card checkout are not supported.

## React

```tsx
import { MarkeeModal } from '@markee_team/sdk/react';

<MarkeeModal
  open={open}
  onClose={() => setOpen(false)}
  wallet={walletAdapter}
  placement={{ kind: 'gardens-community', chainId: 100, community: communityAddress }}
/>;
```

See [`examples/connectkit`](https://github.com/1Hive/markee/tree/feature/markee-sdk/examples/connectkit) for a complete adapter. Its connection promise resolves only once ConnectKit has selected a provider and rejects when the picker is dismissed. The SDK does not install a second wallet context.

## Modal layout

Both strategies use a consistent, compact 512px panel with a fixed header/footer, a collapsible leaderboard, the selected message or editor, and a prominent amount card. The leaderboard pins your loaded messages and offers inline funding selection. Your active rental message is selected when available; otherwise an owned message or the creation form is shown.

For Sale uses the same arrangement with a one-time ETH amount. For Rent uses an ETHx monthly rate and links to Deposit manager. Wallet balances, rewards, refunds, edits, and community treasury actions remain accessible without top-level tabs. The footer holds the review/confirmation actions and Stop streaming when applicable.

MIN and WIN/2× fill the amount without sending a payment. Suggestions use the loaded ranking, preserve integer precision, and account for the selected message's existing funding or stream contribution. Rankings can change; the server still validates and simulates each reviewed action. New rentals retain the selected rate across message creation and require a separate stream confirmation. Payment reviews and drafts survive navigation back to the editor.

## Theme

Pass a typed `theme` option to `createMarkee` or a `theme` prop to the React modal. Light is the default; `mode: 'dark'` selects the dark palette and `mode: 'system'` follows device changes while the modal is open.

```tsx
import { createMarkee, type MarkeeTheme } from '@markee_team/sdk';

const theme: MarkeeTheme = {
  mode: 'system',
  fontFamily: '"DM Sans", system-ui, sans-serif',
  radius: 12,
  colors: {
    primary: '#743a84',
    primaryText: '#ffffff',
    accent: '#eac6f1',
    accentText: '#50265b',
  },
};

// React: <MarkeeModal {...modalProps} theme={theme} />
// JavaScript:
const markee = createMarkee({ theme });
markee.setTheme({ mode: 'dark' });
markee.setTheme(); // Reset to the default light theme.
```

Theme changes update styles in place: drafts, focus, scroll, wallet sessions, and payment reviews stay intact. In JavaScript, `setTheme` replaces the theme for the open modal and future opens. You can also supply `open({ placement, theme })` for a single opening, or call `modal.setTheme(theme)` on the returned modal. In React, update the `theme` prop. Removing it resets the default.

| Option | Customization |
| --- | --- |
| `mode` | `light`, `dark`, or `system` |
| `fontFamily` | CSS font stack; the app supplies any custom font |
| `radius` | Panel radius in pixels, 0–48 (default 22); card and control corners scale with it |
| `colors` | Partial overrides for the semantic tokens below |

Color tokens: `background`, `surface`, `text`, `muted`, `border`, `inputBackground`, `inputText`, `primary`, `primaryText`, `accent`, `accentText`, `accentSurface`, `accentSurfaceText`, `accentBorder`, `selected`, `selectedText`, `info`, `infoText`, `error`, `errorText`, `success`, `successText`, `link`, `focusRing`, and `overlay`. Set foreground/background pairs together and check your brand's contrast in both modes. Overrides apply over either selected palette; omitted values use that palette's defaults. Invalid CSS color/font values fall back to defaults.

Styles are scoped to the modal's Shadow DOM and do not change the host app or its wallet picker. The ConnectKit sample includes light, dark, device, and custom Plum presets.

## Headless API

`new MarkeeClient(options)` provides `snapshot`, `prepare`, `send`, `verify`, `pending`, `recordView`, `quote`, `authorize`, `executeAuthorization`, `resumeAuthorization`, and `bridgeStatus`. Exported TypeScript types describe the complete request/response contract.

- `snapshot(placement, account?, offset?)`: chain state, metadata, moderation, views, rewards and wallet balances. The first page is ranked; subsequent pages browse the registry. Enforced winner and the wallet's current backing remain included.
- `prepare(placement, action)`: validates membership/ownership, simulates and estimates the exact transaction, and returns a five-minute review. All financial inputs are decimal **wei strings**; use `parseEth` for user input.
- `send(preparation)`: rechecks account, requests a chain switch when necessary, and sends through the host wallet. It never signs with a backend key.
- `verify(pending)`: binds the submitted hash to the prepared sender, recipient, calldata and value, waits for two block confirmations, and reports actual token transfers. A reverted transaction or deferred settlement is not a reward success.
- Pending transactions are stored per API URL, wallet and placement. Closing/reopening resumes verification. Unknown transactions remain pending and block duplicate submissions. A replacement hash is not automatically inferred; inspect it in the wallet/explorer and pass the matching replacement to `verify`.
- Admin signatures have a five-minute challenge window, one-time nonces, and a durable server-side operation record. Retrying the same signature recovers the saved operation instead of spending twice. In-flight signatures are stored locally for recovery and removed after a terminal result. A record interrupted before a hash was saved requires operator reconciliation; it is never automatically executed again.

## Payment semantics

For Sale supports create/fund/edit. New message ownership belongs to the caller. Funding an existing message does not transfer ownership; MARKEE rewards go to the payer when RevNet is enabled.

For Rent supports message creation, starting/updating/switching/stopping a stream, wrap/unwrap, pool connection/refunds, board-buffer recovery, ranking refresh and settlement. The server builds the complete Superfluid batch, including exact ETHx approval and pool connection. Wallet runway uses the combined CFA and GDA net flow across the wallet, not only the current board. Rental MARKEE comes from actual settled rent, never merely from wrapping or depositing ETH.

Community activation supports the current council Safe, a current Safe owner, or the configured authorized keeper. Revenue claims support the current Safe or its current owners and always pay the council treasury. Existing outbound Across, Squid and LI.FI routing lives on Markee's server.

## Integration boundaries

- Current board versions: `1.3.0` For Sale and `streaming-1.0.0` For Rent, on Base and configured Sepolia deployments. Additional factories must be enabled on Markee's server. Legacy strategy versions are rejected explicitly.
- Transaction sending currently expects an EIP-1193 wallet returning an on-chain transaction hash with the connected wallet as the transaction sender. UserOperation-only and Safe transaction-service hashes need a future adapter; they are not treated as successful direct transactions. Community authorization independently supports ERC-1271 Safe signatures.
- The native ETHx downgrade uses the deployed contract's native transfer path. Contract accounts whose receive function needs more than its transfer stipend may not support it; simulation catches the failure before prompting.
- The modal renders escaped text, uses isolated CSS, and supports keyboard focus, Escape, mobile sizing and reduced motion. A host CSP must permit the SDK's inline styles and connections to its configured Markee API. No external font or image is needed by the modal.
- API failures are explicit. Without moderation data, message text is withheld. No mock balances or fabricated rewards are returned by production handlers.

Backend configuration and API reference: [`docs/sdk/implementation.md`](https://github.com/1Hive/markee/blob/feature/markee-sdk/docs/sdk/implementation.md).

## API endpoint

No API URL or Markee API key is required. The SDK connects to the Markee-hosted API and centralizes on-chain reads, metadata, and transaction preparation. For local development or testing, pass an optional `apiUrl` override to `createMarkee`, `MarkeeClient`, or the React modal. The endpoint used by your installed release is exported as `DEFAULT_MARKEE_API_URL`.

## LLM implementation prompt

Copy this prompt into your coding assistant. It gathers missing requirements before implementing the integration.

```text
Integrate @markee_team/sdk@latest into this app. Inspect the codebase first and
follow its existing framework, styling, and wallet patterns. Read the installed
package README and types for current capabilities.

Before implementing, ask me to create my leaderboard on Markee at
https://www.markee.xyz/create-a-markee, then provide its resulting Markee page link.
If I already have a leaderboard, ask for that link instead; do not create a duplicate.
Example link format:
https://www.markee.xyz/markee/0x6ceBC87DE40519Fa52fc40a1d49f16FF968bb439
Never silently substitute a demo board. Wait for my link before wiring the placement.

Extract the board address from the /markee/<address> path. Validate the Markee URL
and the address (0x followed by 40 hexadecimal characters). Markee website boards
currently use Base, chain ID 8453. Verify the board through the SDK snapshot API;
if verification fails, explain the error and ask for a corrected link.

Do not ask me to choose For Sale or For Rent in the host app. That choice is made
when creating the leaderboard on Markee. The API returns strategy and the SDK
adapts the modal automatically. Do not add a strategy prop, toggle, or hardcoded mode.

Ask only the remaining unanswered requirements in one concise group:
- Where should Markee appear, what opens the modal, and what should the button say?
- Should it reuse the app's existing wallet or use SDK wallet discovery? Inspect
  existing connectors first; do not add a second wallet context or install a new
  connector without agreement.
- Should the modal match the app theme or use specific colors, font, radius, and
  light/dark/system mode?
- What should happen after a confirmed transaction: notification, refresh,
  navigation, or callback? Are there additional mobile/accessibility requirements?

Then implement the agreed scope:
1. Install @markee_team/sdk@latest. No API URL or Markee API key is required.
   Do not create an API proxy or add RPC/database credentials.
2. Use placement = { kind: 'board', chainId: 8453, address: extractedAddress }.
   Use new MarkeeClient().snapshot(placement) to verify the board and read strategy,
   name, minimum, and other metadata. The modal performs its own snapshot loading;
   do not recreate that loading or strategy logic in the host app.
3. For React, use MarkeeModal from @markee_team/sdk/react in a client component
   with open, onClose, and placement. Otherwise use createMarkee() from
   @markee_team/sdk, then open({ placement }); close it on teardown.
4. If a host wallet exists, pass its selected EIP-1193 provider through the wallet
   adapter. For ConnectKit/wagmi use the active connector. Resolve connect after
   selection, reject cancellation, and do not silently switch wallet providers.
   Otherwise omit wallet and use SDK wallet discovery.
5. Apply theme options while preserving the built-in modal layout. Handle onEvent
   if needed; show success only for a confirmed event. Let the SDK manage review,
   network switching, submission, and verification.
6. Verify build/types, loading of the supplied board, automatic strategy selection,
   open/close behavior, theme, and wallet reuse. Do not sign or send transactions
   during automated verification. Report changed files, checks, and limitations.

Check the installed release's supported features before promising functionality.
The SDK supports wallet-funded flows; card checkout and incoming bridging are not
yet available. Transactions use real funds.
```
