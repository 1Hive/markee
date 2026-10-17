export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type Placement =
  | { kind: 'board'; chainId: number; address: Address }
  | { kind: 'gardens-community'; chainId: number; community: Address };
export interface Entry {
  address: Address; owner: Address; message: string; name: string;
  score: string; totalFunds: string; aggregateRate: string; legacyFloor: string;
  moderated: boolean | null; views: number | null;
}
export interface WalletState {
  address: Address; eth: string; markee: string | null; ethx: string;
  backedMarkee: Address | null; flowRate: string; deposit: string; withdrawableDeposit: string;
  pendingSettlement: string; refundRate: string; pool: Address | null;
  poolConnected: boolean; poolClaimable: string; netFlowRate: string;
  runwaySeconds: string | null; observedAt: number;
}
export interface CommunityState {
  integration: { status: 'not_integrated' | 'active'; leaderboardAddress: Address | null; vaultAddress: Address | null };
  markeeChainId: number; revenue: { claimableAmount: string; symbol: string };
  permissions?: { canActivate: boolean; canClaim: boolean; councilSafe: Address | null };
}
export interface Snapshot {
  freshness?: { updatedAt: number; freshUntil: number; staleUntil: number; stale: boolean; refreshing: boolean };
  apiVersion: 1; placement: Placement; board: Address | null; chainId: number;
  strategy: 'sale' | 'rent'; name: string; minimum: string;
  maxMessageBytes: number; maxNameBytes: number; revnetEnabled: boolean;
  token: Address | null; entries: Entry[]; nextOffset: number | null; count: number;
  top: Address | null; rankedTop: Address | null; wallet: WalletState | null;
  community?: CommunityState; warnings: string[]; blockNumber: string;
  metadata?: { siteUrl: string | null; logoUrl: string | null; verifiedUrls: string[] } | null;
}
export type Action =
  | { kind: 'create'; message: string; name: string; amount?: string }
  | { kind: 'fund'; markee: Address; amount: string }
  | { kind: 'edit-message'; markee: Address; message: string }
  | { kind: 'edit-name'; markee: Address; name: string }
  | { kind: 'stream'; markee: Address; monthlyAmount: string }
  | { kind: 'stop' | 'withdraw-buffer' | 'settle' }
  | { kind: 'claim-refund' | 'connect-refund'; markee: Address }
  | { kind: 'wrap' | 'unwrap'; amount: string }
  | { kind: 'claim-top'; markee: Address };
export interface PreparedAction {
  id: string; expiresAt: number; placement: Placement; action: Action;
  transaction: { from: Address; to: Address; chainId: number; data: Hex; value: Hex; gas: Hex };
  review: { title: string; lines: string[]; estimatedGasCost: string; reward: string };
}
export interface TransactionResult {
  status: 'pending' | 'confirmed' | 'reverted'; hash: Hex; explorerUrl: string;
  createdMarkee?: Address; tokensReceived?: string; settlement?: 'paid' | 'deferred';
}
export interface ClaimQuote {
  bridgeProtocol: 'across' | 'lifi' | 'squid' | 'none'; bridged: boolean;
  claimAmount: string; estimatedFeeAmount: string; estimatedNetworkFeeAmount: string;
  expectedAmountOut: string; destinationSymbol: string; expiresAt: number; markeeChainId: number;
}
export interface Authorization {
  nonce: string; typedData: {
    domain: { name: string; version: string; chainId: number; verifyingContract: Address };
    types: Record<string, { name: string; type: string }[]>;
    primaryType: string; message: Record<string, unknown>;
  };
}
export interface AdminResult {
  transactionHash: Hex; transactionUrl?: string; bridgeName?: string | null;
  bridged?: boolean; bridgeProtocol?: ClaimQuote['bridgeProtocol'];
  expectedAmountOut?: string; destinationSymbol?: string;
}
export interface AdminOperation {
  id: string; status: 'working' | 'submitted' | 'complete' | 'failed';
  result?: AdminResult; error?: string;
}
export interface BridgeStatus {
  status: 'needs_gas' | 'not_found' | 'ongoing' | 'partial_success' | 'refund' | 'success' | 'unknown';
  destinationTransactionUrl: string | null; sourceTransactionUrl: string | null;
}
export interface EIP1193Provider {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}
/** Return the app's selected wallet. Never create a second wallet session. */
export interface WalletAdapter {
  getProvider(): Promise<EIP1193Provider | null>;
  connect?(): Promise<EIP1193Provider>;
}
/** Semantic color pairs used throughout the modal, including forms and notices. */
export interface MarkeeThemeColors {
  background: string; surface: string; text: string; muted: string; border: string;
  inputBackground: string; inputText: string;
  primary: string; primaryText: string; accent: string; accentText: string;
  accentSurface: string; accentSurfaceText: string; accentBorder: string;
  selected: string; selectedText: string;
  info: string; infoText: string; error: string; errorText: string;
  success: string; successText: string; link: string; focusRing: string; overlay: string;
}
export interface MarkeeTheme {
  /** Defaults to light. System follows the OS preference, including live changes. */
  mode?: 'light' | 'dark' | 'system';
  /** Overrides the selected palette. Set foreground/background pairs together. */
  colors?: Partial<MarkeeThemeColors>;
  /** A CSS font-family stack. Fonts are supplied by the host app. */
  fontFamily?: string;
  /** Panel corner radius in pixels, clamped to 0–48. Controls scale with it. Default: 22. */
  radius?: number;
}
export interface SDKOptions {
  apiUrl: string; wallet?: WalletAdapter; fetch?: typeof fetch;
  theme?: MarkeeTheme;
  onEvent?: (event: { type: 'submitted' | 'confirmed' | 'error'; hash?: Hex; message?: string }) => void;
}
