# Markee SDK × ConnectKit

A standalone React/Vite example that embeds the Markee sign and payment modal. ConnectKit supplies the app wallet; Markee supplies the sign, moderation data, payment preparation, reward quote, and transaction verification through its hosted API. The SDK knows its API endpoint, so this app needs no Markee, RPC, or database key.

## Run locally

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The sample uses the latest published `@markee_team/sdk` and two existing Base boards. The **For sale** board supports one-time payments and MARKEE rewards; **For rent** uses ETHx streaming. These are live contracts, so confirming in a wallet moves real funds.

Use the theme selector to preview light, dark, system, and a custom brand palette. The app passes its selected ConnectKit wallet to the SDK. With no app wallet, supported For Sale payments can continue through Markee's hosted checkout.

## Configuration

Copy `.env.example` to `.env.local` only if you want to change the boards or enable WalletConnect. `VITE_WALLETCONNECT_PROJECT_ID` is optional; without it, installed browser wallets remain available. To target a local Markee API during development, set `VITE_MARKEE_API_URL=http://localhost:3000/api/sdk/v1`. The default is managed by the SDK.

For a new integration, [create a Markee leaderboard](https://www.markee.xyz/create-a-markee), then use the board address from its `markee.xyz/markee/0x…` link. The SDK detects whether the board is For Sale or For Rent. No strategy setting is needed.

## Deploy

Deploy this repository as a Vite project on Vercel. The build command is `npm run build` and the output directory is `dist`. No environment variables are required for the default boards. If you enable WalletConnect, add `VITE_WALLETCONNECT_PROJECT_ID` to the Vercel project and redeploy.

```sh
npm run build
```

The SDK API target is currently Markee staging (`2staging.markee.xyz`).
