# Markee sign and moderation in the SDK

The SDK provides a self-contained `MarkeeSign` React component and a plain JavaScript `createMarkeeSign` mount. Both show the current winner of a For Sale or For Rent board, use the SDK theme, and can open the existing payment modal. The host app supplies only the existing board placement and, optionally, its wallet adapter. Markee's SDK snapshot API provides the message, author, winner, and moderation status.

The `release/moderation-queue` branch separates moderation into **board flags** and **site flags**. Board owners and their moderators set board flags; these apply to every integration. Global Markee admins set site flags; those apply on markee.xyz only. SDK snapshots read only board flags from the Markee database. They do not require each integrator to install a moderation provider or hold database credentials.

The sign blurs flagged message text and author with a visible notice, with no reveal action. Unknown moderation status withholds the content. Board flag changes invalidate the shared SDK snapshot namespace; an open sign polls for changes. The existing SDK modal continues to use the same snapshot status and shows a moderation placeholder instead of flagged text.

The moderation queue, moderator membership, signing, email notifications, scan jobs, and flag writes remain Markee server responsibilities. The SDK currently presents moderation status but does not expose a moderator action UI. A later moderator UI should use Markee-hosted, signed API actions and server-side authorization rather than copying admin lists or queue state into partner apps. Site-specific moderation is intentionally not projected onto partner sites.
