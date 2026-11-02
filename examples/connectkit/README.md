# Markee × ConnectKit sample

Use **Modal theme** to try Light, Dark, Match device, or Plum. Plum demonstrates custom colors, font, and corner radius. The typed presets in `src/App.tsx` are passed directly to the modal's `theme` prop; they can be replaced with your app's brand. See the [theme API](../../packages/sdk/README.md#theme) for all options and live updates.

This Vite/React app embeds `@markee_team/sdk/react` and lends it the wallet already selected by ConnectKit. Installed wallets work without a WalletConnect project ID. Setting the optional ID enables WalletConnect as well.

From the repository root:

```sh
npm ci --prefix packages/sdk
npm run build --prefix packages/sdk
npm ci --prefix frontend
npm ci --prefix examples/connectkit
```

Start Markee's backend in one terminal:

```sh
npm run dev --prefix frontend
```

Start the example in another:

```sh
npm run dev --prefix examples/connectkit
```

Open `http://127.0.0.1:5173`. To point both the live sign and payment modal at your local Markee backend, put `VITE_MARKEE_API_URL=http://localhost:3000/api/sdk/v1` in `examples/connectkit/.env.local` and restart the sample. Without this override, the SDK uses its built-in endpoint. Copy `.env.example` to `.env.local` to supply other board or community settings. Public board addresses are configuration; no RPC or storage keys are needed in this app.

The default For Sale and For Rent boards are the two real Base sample boards. The app never submits a transaction until the user reviews it and confirms in their own wallet. For local financial testing use the repository's isolated Anvil suites; do not put a production keeper key in a fork environment.

Without Markee-side database credentials, the local backend serves chain reads but marks views/moderation unavailable and withholds unmoderated text. Community activation/claims additionally need Markee-side router, factory and keeper configuration. See the [backend guide](../../docs/sdk/implementation.md).

```sh
npm run build --prefix examples/connectkit
```

The package is linked by a `file:` dependency. Rebuild `packages/sdk` after editing it, then reload the sample. Production Gardens integration, card checkout, incoming bridges and npm publication are separate follow-up milestones.
