# Scenario 3: For Sale without an app wallet

Uses the real board supplied for the PoC, `0x80783947c9561EFa9BA484D44BBd5AAa03028242` on Base. There is no Privy, wagmi, ConnectKit, wallet provider, RPC key or backend in this sample.

Run `npm install` and `npm run dev` here. The sample runs on http://127.0.0.1:5178 and uses the published `@markee_team/sdk` npm package. To update to the latest release, run `npm install @markee_team/sdk@latest --save-exact`. The lockfile records the tested version.

Stripe/MoonPay funding and USDC-to-ETH conversion run on Markee’s hosted checkout. Those server-side updates become available without another SDK release once deployed and enabled.

The SDK discovers hosted checkout availability from Markee. Until the backend is configured, this sample displays an availability message and the SDK hides the card button. For local backend development only, `VITE_MARKEE_API_URL=http://localhost:3000/api/sdk/v1` overrides the built-in endpoint. Normal implementers do not supply an API URL or key.

Open the modal, enter a message and amount, and choose Pay by card. Markee handles login, embedded wallet, card funding, transaction confirmation and receipt verification. MARKEE goes to the same user-owned wallet that pays. Real card/on-chain acceptance is a separate manual test with real funds.
