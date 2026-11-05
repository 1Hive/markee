# Repository AI instructions

These instructions apply to all coding assistants working in this repository. Follow
package-local guidance as well. Preserve unrelated changes and inspect the current
branch, package versions, and deployment targets before editing or releasing.

## SDK compatibility policy

The compatibility baseline is published `@markee_team/sdk@0.1.0-alpha.22` and
`/api/sdk/v1`. This is a policy baseline, not a claim that a compatibility test
matrix already exists. Do not silently advance or drop the baseline.

An installed SDK can remain in a third-party app long after Markee deploys a new
backend. Updating our own examples does not demonstrate compatibility with those
older clients. Treat these as independently deployed products.

### API contracts

- Preserve `/api/sdk/v1` request and response shapes, field meanings, units,
  strategy behavior, and error semantics. Prefer additive optional fields.
- Do not make a previously optional input mandatory or remove/rename a field
  within v1. Check changes to enum values against older clients' handling too.
- Put incompatible contracts in `/api/sdk/v2`; maintain v1 during a documented
  migration window. Define the support window and migration instructions before
  retiring a version; do not invent a sunset date during implementation.
- Read flags and optional fields defensively in the SDK. Missing feature flags
  mean disabled. Missing optional display data should hide that detail or show
  an unavailable state, not crash the modal. Never invent financial values.
- Keep RPC, database, moderation, and provider logic on Markee's API side. Host
  apps must not need infrastructure credentials to integrate the SDK.

### Public SDK contract and releases

- Preserve placement formats, wallet adapters, theme tokens, React and vanilla
  JavaScript entry points, callbacks, event names, payloads, and event meanings.
  In particular, a confirmed event must still mean a verified payment result.
- Deprecate options before removal. Retain a compatibility path and document the
  replacement; do not silently reinterpret existing configuration.
- After 1.0: patch releases fix bugs compatibly, minor releases add compatible
  features, and major releases contain breaking changes. During alpha, explicitly
  identify breaking releases and document migration requirements; the alpha label
  is not permission to break deployed clients without notice.
- Setup prompts should install `@markee_team/sdk@latest` and read the installed
  README/types. Consumer apps must commit their lockfile for reproducible deploys;
  do not make production installations float on every build.
- Before broader public adoption or 1.0, use a stable production API endpoint.
  Staging must be an explicit override. The SDK defaults to
  `https://www.markee.xyz/api/sdk/v1`; preserve origin-bound recovery for operations
  created with its former staging default. Do not switch origins casually, since
  authentication and active sessions depend on them.

### Checkout and transaction lifecycle

- Prepared reviews, pending transactions, local recovery records, and hosted
  checkout sessions may outlive a deployment. Version persisted formats when
  changing their interpretation and retain readers or migrations for supported
  older formats, including browser storage and server records.
- Preserve recovery for transactions already submitted. A deployment must not
  discard their hashes, attribute an old result to a new action, or cause duplicate
  funding/payment. Never automatically resubmit a financial transaction.
- Compatibility must not preserve insecure behavior. Security fixes can reject
  unsafe older requests. If a supported old client can no longer operate safely,
  provide a clear upgrade-required response and migration instructions. Preserve
  safe receipt/status recovery without restoring the vulnerable authorization path.

### Required compatibility verification

Before changing or deploying SDK API contracts:

1. Identify affected public types, serialized state, consumers, and oldest supported
   published SDK version. Explain whether the change is additive or breaking.
2. Test supported published SDK artifacts against the changed API, including the
   baseline and latest release. Testing only SDK source from the same commit is
   insufficient. Build this matrix before 1.0; if absent or unavailable, report the
   coverage gap instead of claiming backward compatibility.
3. Cover sale and rent snapshots, absent optional fields/flags, wallet adapters,
   preparation/expiry, confirmation events, and pending checkout recovery as relevant.
   Include explicit negative tests for changed security boundaries.
4. Run the owning package's checks. SDK: `npm test --prefix packages/sdk` and
   `npm run build --prefix packages/sdk`. API: `npm run test:sdk --prefix frontend`
   and frontend typecheck; moderation: `npm run test:moderation --prefix frontend`.
   Consult current package scripts for other targeted checks.
5. Report tested SDK/API versions, migration needs, deployment status, and skipped
   live validation. Do not sign transactions or spend funds in automated checks.

## Release delivery

- For SDK changes, publish a new npm version and update the ConnectKit sample at
  https://markee-sdk-connectkit-example.vercel.app/ as part of delivery. Verify the
  registry version, consumer lockfile, build, and actual deployment. Complete any
  required user authentication through the normal release flow; never claim a
  pending publication succeeded.
- API-only changes do not require an identical npm republish. Deploy the backend
  and verify compatibility with the published SDK. Instruction-only edits likewise
  do not require an npm release.
- Update other controlled integrations, including Gardens, when requested. Keep
  their rollout separate from the guarantee that older installed clients still work.
- Preserve the SDK layout and transaction logic. Integration prompts should inspect
  the host app to detect React versus vanilla JavaScript and its existing wallet,
  then match its colors, typography, light/dark behavior, and radii through SDK
  theme options. Ask only about genuinely missing product requirements.
