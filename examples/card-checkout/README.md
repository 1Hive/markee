# Scenario 3: For Sale without an app wallet

Uses the real board supplied for the PoC, `0x80783947c9561EFa9BA484D44BBd5AAa03028242` on Base. There is no Privy, wagmi, ConnectKit, wallet provider, RPC key or backend in this sample.

Build the SDK in `packages/sdk` first, then run `npm install` and `npm run dev` here. The sample runs on http://127.0.0.1:5178. It uses the SDK source package from this checkout, not the last published npm release.

The SDK discovers hosted checkout availability from Markee. Until the backend is configured, this sample displays an availability message and the SDK hides the card button. For local backend development only, `VITE_MARKEE_API_URL=http://localhost:3000/api/sdk/v1` overrides the built-in endpoint. Normal implementers do not supply an API URL or key.

Open the modal, enter a message and amount, and choose Pay by card. Markee handles login, embedded wallet, card funding, transaction confirmation and receipt verification. MARKEE goes to the same user-owned wallet that pays. Real card/on-chain acceptance is a separate manual test with real funds.
