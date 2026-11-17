// Shared by the server check (lib/auth/wallet-session.ts) and the client sender
// (hooks/useWalletAuthFetch.ts), so the two can never disagree on the header or the fallback code.

// Header carrying the Privy identity token, whose signed linked_accounts list the session's wallets.
export const ID_TOKEN_HEADER = 'privy-id-token'
// 401 code telling the client the session does not cover the wallet, so it should sign instead.
export const SESSION_REQUIRED = 'SESSION_REQUIRED'
