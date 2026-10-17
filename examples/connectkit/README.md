# Markee × ConnectKit sample

Use **Modal theme** to try Light, Dark, Match device, or Plum. Plum demonstrates custom colors, font, and corner radius. The typed presets in `src/App.tsx` are passed directly to the modal's `theme` prop; they can be replaced with your app's brand. See the [theme API](../../packages/sdk/README.md#theme) for all options and live updates.

This Vite/React app embeds `@markee/sdk/react` and lends it the wallet already selected by ConnectKit. Installed wallets work without a WalletConnect project ID. Setting the optional ID enables WalletConnect as well.

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

Open `http://127.0.0.1:5173`. The default API is `http://localhost:3000/api/sdk/v1`. Copy `.env.example` to `.env.local` to change it or supply a rental board / community. Public board addresses are configuration; no RPC or storage keys are needed in this app.

The default For Sale board is Gardens' real Base root. The app never submits a transaction until the user reviews it and confirms in their own wallet. For local financial testing use the repository's isolated Anvil suites; do not put a production keeper key in a fork environment.

Without Markee-side database credentials, the local backend serves chain reads but marks views/moderation unavailable and withholds unmoderated text. Community activation/claims additionally need Markee-side router, factory and keeper configuration. See the [backend guide](../../docs/sdk/implementation.md).

```sh
npm run build --prefix examples/connectkit
```

The package is linked by a `file:` dependency. Rebuild `packages/sdk` after editing it, then reload the sample. Production Gardens integration, card checkout, incoming bridges and npm publication are separate follow-up milestones.
