# Markee SDK × ConnectKit

A standalone React/Vite example that embeds the Markee sign and payment modal. ConnectKit supplies the app wallet; Markee supplies the sign, moderation data, payment preparation, reward quote, and transaction verification through its hosted API. The SDK knows its API endpoint, so this app needs no Markee, RPC, or database key.

The sign is a themed button. `MarkeeSign` fetches the current winner and moderation state on its own, blurs flagged messages, and opens the modal when clicked. The sample controls that modal through `onOpen`, so its separate Open Markee button still works and the sign and modal can have different themes. The ConnectKit wallet is passed only to the modal.

```tsx
<MarkeeSign placement={placement} theme={signThemeConfig} onOpen={() => setOpen(true)} />
<button onClick={() => setOpen(true)}>Open Markee</button>
<MarkeeModal placement={placement} open={open} onClose={() => setOpen(false)} wallet={wallet} theme={themes[modalTheme]} />
```

## Run locally

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The sample uses the latest published `@markee_team/sdk` and two existing Base boards. The **For sale** board supports one-time payments and MARKEE rewards; **For rent** uses ETHx streaming. These are live contracts, so confirming in a wallet moves real funds.

Use the separate sign and modal theme selectors to preview charcoal, light, dark, system, and a custom brand palette. The sign fades in a theme-matched MARKEE logo on hover or keyboard focus; the Markee logo on hover control toggles `theme.sign.hoverLogo`. The app passes its selected ConnectKit wallet to the modal. With no app wallet, supported For Sale payments can continue through Markee's hosted checkout.

## Configuration

Copy `.env.example` to `.env.local` only if you want to change the boards or enable WalletConnect. `VITE_WALLETCONNECT_PROJECT_ID` is optional; without it, installed browser wallets remain available. To target a local Markee API during development, set `VITE_MARKEE_API_URL=http://localhost:3000/api/sdk/v1`. The default is managed by the SDK.

For a new integration, [create a Markee leaderboard](https://www.markee.xyz/create-a-markee), then use the board address from its `markee.xyz/markee/0x…` link. The SDK detects whether the board is For Sale or For Rent. No strategy setting is needed.

## Deploy

Deploy this repository as a Vite project on Vercel. The build command is `npm run build` and the output directory is `dist`. No environment variables are required for the default boards. If you enable WalletConnect, add `VITE_WALLETCONNECT_PROJECT_ID` to the Vercel project and redeploy.

The published sample registers `https://markee-sdk-connectkit-example.vercel.app` with Markee for both default boards. If you fork it, set `VITE_PUBLIC_SITE_URL` to your public HTTPS origin and update the `data-markee-address` markers in `index.html` to match your boards. Markee reads the published HTML before accepting the site.

```sh
npm run build
```

The SDK uses the production Markee API (`https://www.markee.xyz/api/sdk/v1`) by default.
