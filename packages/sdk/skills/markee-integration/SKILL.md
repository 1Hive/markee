---
name: markee-integration
description: Integrate the published Markee SDK into one board page or many platform community pages, matching the host app's wallet and theme.
---

# Integrate Markee

1. Install `@markee_team/sdk@latest`, commit the resulting lockfile, and read the **installed** package's README and exported TypeScript declarations before coding. Do not float the version on each production build. Inspect the host app's framework, route parameters, project or community records, chain configuration, wallet connector, and theme. Use the React entry point only in React apps; use `createMarkeeSign` and `createMarkee` in plain JavaScript.
2. Match the host's colors, typography, light/dark behavior, and radii with SDK theme options. Reuse its connected EIP-1193 wallet when present. Keep the sign and modal independently controllable: `MarkeeSign` can open its own modal or call `onOpen` for an app-controlled `MarkeeModal`.

## One existing board

Ask the user to create a board at https://www.markee.xyz/create-a-markee if one does not exist. Ask for its Markee page URL, extract the board address from `/markee/0x…`, and pass `placement={{ kind: 'board', chainId: 8453, address }}`. Do not substitute a demo address. The board's For Sale or For Rent strategy is selected on Markee, not in the host config.

## Many community or project pages

Use `multiBoard={{ platformId, chainId, communityId }}` on both `MarkeeSign` and a separately controlled `MarkeeModal`; plain JavaScript accepts the same object in `createMarkeeSign(container, options)` and `markee.open(options)`. Supply exactly one of `placement` or `multiBoard` per component or open call.

- Infer `platformId` from the Markee-registered platform integration, not from a display label. Inspect existing platform configuration and the API registration. A host cannot register an arbitrary ID or define its own authorization rule. Ask the user only if multiple registered IDs plausibly apply or none is identifiable.
- Infer `chainId` from the chain where this page's community or project identity lives. The Markee board and beneficiary are on Base regardless of identity chain. The Giveth design-test identity chain is Base `8453`; Giveth activation is not live.
- Infer `communityId` from the **current route's** canonical project/community record. For Gardens, use the RegistryCommunity address; for Revnet, use the project ID. Never hardcode one community or use a demo ID across pages. Ask only if the host has no reliable source or multiple plausible IDs.
- Follow route changes so all three values update together. The old community's sign, moderation state, and modal must disappear before the new snapshot loads. Keep `MarkeeSign` and `MarkeeModal` on the same current identity.

Markee's API checks the Base registrar for the community-to-board mapping. An active board shows its moderated sign. An unactivated community offers setup only when the platform is enabled and the connected account is authorized. Activation asks the authorized user for one strategy and a **Base beneficiary address**; Markee rechecks authorization and creates the board. Some factories require the activator to accept board admin on Base. Disabled, unknown, or unavailable platforms must not appear activatable. Gardens is a controlled pilot; Revnet and Giveth remain gated prototypes until Markee enables them.

## Site verification and checks

Automatic site verification requires a resolved board address and a public HTTPS page whose server-returned HTML contains `<span hidden data-markee-address="0xBOARD_ADDRESS"></span>`. Merely supplying `multiBoard` does not verify a domain; a client-injected marker is insufficient. Verify the actual deployed page once a board exists. Test two different community routes, an inactive route, API unavailability, and moderation without sending funds. Do not add RPC, database, or provider credentials to the host app.
