# @markee_team/sdk

An ESM JavaScript SDK with a self-contained, Shadow DOM modal and an optional React entry point. The SDK knows the Markee API endpoint; the host only supplies its placement and, optionally, its current wallet provider. No Alchemy, Redis, Privy, or bridge-provider key belongs in the consuming app.

This is an experimental `0.1.0-alpha.3` release for wallet-funded For Sale and For Rent flows. Hosted card checkout and incoming cross-chain funding are not included.

Install the alpha:

```sh
npm install @markee_team/sdk@alpha
```

Use React 18 or 19 for the optional React entry point. The plain JavaScript entry point does not require React. Both TypeScript bundler and NodeNext resolution are supported.

To build from the source repository:

```sh
npm ci --prefix packages/sdk
npm run build --prefix packages/sdk
```

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

Without a wallet adapter, browsing works without a wallet. On a connect click the modal discovers installed wallets using EIP-6963, with an EIP-1193 fallback. Multiple discovered wallets are offered for explicit selection. An adapter always takes precedence over injected discovery. Hosted login/card checkout is not part of milestones 1–4.

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

Both strategies follow Gardens' For Rent modal: a compact, 512px panel with a fixed header/footer, a collapsible leaderboard, the selected message or editor, and a prominent amount card. The leaderboard pins your loaded messages and offers inline funding selection. Your active rental message is selected when available; otherwise an owned message or the creation form is shown.

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

Backend configuration, endpoint details, and verification evidence: [`docs/sdk/implementation.md`](https://github.com/1Hive/markee/blob/feature/markee-sdk/docs/sdk/implementation.md).

## API endpoint

No API URL configuration is required. This alpha uses the Markee staging API at `https://markee-git-feature-markee-sdk-1hive.vercel.app/api/sdk/v1`. For local development or testing only, pass an optional `apiUrl` override to `createMarkee`, `MarkeeClient`, or the React modal. The current default is also exported as `DEFAULT_MARKEE_API_URL`.

## LLM implementation prompt

Copy this prompt into your coding assistant. It gathers missing requirements before implementing the integration.

```text
Integrate @markee_team/sdk@latest into this app. Inspect the app first and
follow its existing framework, styling, and wallet patterns. Read the installed
release README and types to verify current features and integration requirements.

Before changing code, inspect what is already available, then ask me the unanswered
questions below in one concise group. Do not ask again for facts already provided.
Wait for answers about strategy, placement, and intended scope before implementing.

1. Choose exactly one strategy: For Sale (one-time funding) or For Rent
   (recurring streaming payments). Do not offer or implement both.
2. Is this a proof of concept or an integration with your own Markee placement?
   For your own placement, what are the chain ID and board address, or the Gardens
   community address and chain ID? If unknown, ask for the existing Markee/Gardens
   link so we can identify and verify the placement. Never invent an address or
   assume a board supports the chosen strategy. Offer demo boards only with consent;
   explain that they use real Base funds, not a sandbox. If no placement exists,
   identify that prerequisite instead of silently substituting a demo board.
3. Where should Markee appear (page/component), what should open the modal, and
   what should the button say? Is the placement fixed or selected per community?
4. Should we reuse the app's existing connected wallet or use SDK wallet discovery?
   Inspect the installed connector first. If a new host wallet connector is needed,
   ask which one; do not install ConnectKit automatically.
5. Should the modal match the app's theme, or use specific light/dark/system mode,
   brand colors, font, and corner radius? Suggest the existing app theme by default.
6. After a confirmed transaction, should the app show a message, refresh data,
   navigate, or notify an existing callback? Are there accessibility, mobile, or
   framework constraints not evident from the code?

Explain that this alpha uses a built-in staging API and supports wallet-funded
flows; card checkout and incoming bridging are unavailable. If either is required,
ask whether to proceed with the supported scope instead of promising those features.
Summarize the agreed requirements and implement only the selected strategy.

- Install @markee_team/sdk@latest. The SDK knows its API endpoint. Do not
  request an API URL, build an API proxy, or add RPC/database/provider keys.
- For React 18/19, import MarkeeModal from @markee_team/sdk/react in a client
  component and supply open, onClose, and placement. For other apps, import
  createMarkee from @markee_team/sdk, call createMarkee(), then open({ placement }).
  Close the instance on teardown. Reuse the built-in modal UI.
- Use the agreed placement and strategy. Only if I explicitly choose a demo, use
  the corresponding existing Base board below (use only the chosen strategy):
  For Sale: { kind: 'board', chainId: 8453,
    address: '0x2768BC6e90266248BD8bCF5401C36D8049CdF671' }
  For Rent: { kind: 'board', chainId: 8453,
    address: '0x82cbe3BdFC4e01940D186Ac5EA151355647DE0d3' }
- Wallet integration is optional. Reuse the app's selected EIP-1193 provider via
  wallet.getProvider(): Promise<provider | null> and optional
  wallet.connect(): Promise<provider>. For ConnectKit/wagmi, use the active
  connector's provider, resolve connect after selection, and reject cancellation.
  Do not create a second wallet context or silently select another injected wallet.
  If there is no existing wallet integration, omit wallet for SDK wallet discovery.
- Match the app using theme: mode ('light', 'dark', 'system'), fontFamily, radius,
  and semantic colors such as primary and primaryText. Preserve the built-in
  layout and its isolated Shadow DOM styles.
- Optionally handle onEvent and show success only for a confirmed event. Let the
  SDK handle payment review, chain switching, submission, and verification.
  Do not advertise card checkout or incoming bridging: this alpha lacks those
  features. The demo boards use real Base funds.
- Run typecheck/build and verify the selected modal flows load without API configuration,
  open/close correctly, and match the theme. Verify host wallet reuse if available.
  Do not sign or submit transactions during automated verification. Report changed
  files, checks, and remaining limitations.

This alpha automatically uses Markee's temporary staging backend. Read the installed
package README for exact types and configuration details.
```
