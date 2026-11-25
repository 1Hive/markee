# SDK integration and migration audit — 2026-11-25

Source: production public listing APIs at `https://www.markee.xyz/api/{openinternet,forsale,streaming}/leaderboards`, read on 2026-11-25. The accompanying CSV lists every visible board without a verified site URL or verified GitHub embed. A missing record is **not** proof that no website exists.

| Category | Visible boards | Migrated predecessors | No verified site or GitHub embed |
| --- | ---: | ---: | ---: |
| Open Internet | 34 | 34 | 24 |
| For Sale | 20 | 20 | 17 |
| Streaming | 83 | 82 | 73 |
| **Total** | **137** | **136** | **114** |

The one streaming board without `migratedFrom` is a new v1.4 board with a verified GitHub embed. The public listings therefore show **no visible legacy board still awaiting on-chain migration**. This is a listing-level finding, not an independent audit of every migrator transaction or of boards omitted from the listings.

The 114 CSV rows need an integration check, not another contract migration. Examples include **Gitcoin** (Open Internet), **Gyralis**, **ETH Daily Markee**, several **Gardens Community** boards, and **OvertimeMarket.xyz** boards (Streaming). None of these has a recorded `siteUrl` in the public listing. Check their actual host applications before assuming they are live or using the SDK.

Before SDK beta.17, `/api/sdk/v1` requests did not identify their SDK version. An unmarked request might be an older SDK or a custom client; direct contract users may never call Markee's API. Beta.17 adds `client=markee-sdk@<version>` to snapshot and prepare requests. The API records the resolved Base board, self-reported version, requesting origin host, and last-seen time for 90 days, with at most 32 client/origin pairs per board. It stores no account, IP, or page path. A custom client can imitate the marker, and a domain observed this way is **not verified**. Use the marker to prioritize outreach, then inspect the host code and verify its public page marker before marking an integration migrated.

To inspect a board after the API and SDK are deployed, run `node scripts/report-sdk-clients.mjs <board>` from `frontend` with its server-side KV environment. No historical version attribution can be recovered from this new marker.
