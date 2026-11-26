import { PRODUCTION_API_URL, storageOrigins } from './storage-origins.js';
import { SDK_VERSION } from './version.js';
import { errorMessage } from './errors.js';
import { WalletRecoveryStore, RECOVERY_BLOCKED, RECOVERY_STORAGE, recoveryStorage, sameWalletPlacement, type WalletRecovery } from './wallet-recovery.js';
import type { MessageCheck, Action, ModerationOptions, ModerationSeverity, Address, AdminOperation, AdminResult, Authorization, BridgeStatus, ClaimQuote, EIP1193Provider, Hex, Placement, PreparedAction, SDKOptions, Snapshot, SiteVerification, TransactionResult } from './types.js';

const MODERATION_RULES = ['profanity', 'links', 'addresses', 'ens'] as const;
const PRESET_RULES: Record<ModerationSeverity, readonly string[]> = { relaxed: [], standard: ['profanity'], strict: MODERATION_RULES };

/**
 * Request fields for the moderation options: `severity` as given, plus `rules` as the complete
 * comma-separated list of enabled optional rules when any rule is set. Rules left unset follow the
 * severity preset (Standard by default). Servers without per-rule support ignore `rules` and apply
 * `severity`.
 */
export function moderationParams(moderation?: ModerationOptions): { severity?: ModerationSeverity; rules?: string; policy?: string } {
  const out: { severity?: ModerationSeverity; rules?: string; policy?: string } = {};
  if (moderation?.version !== undefined) { out.policy = JSON.stringify(moderation); return out; }
  if (moderation?.severity) out.severity = moderation.severity;
  const rules = moderation?.rules;
  if (rules && MODERATION_RULES.some(name => typeof rules[name] === 'boolean')) {
    const base = PRESET_RULES[moderation?.severity ?? 'standard'] ?? PRESET_RULES.standard;
    out.rules = MODERATION_RULES.filter(name => typeof rules[name] === 'boolean' ? rules[name] : base.includes(name)).join(',');
  }
  return out;
}

/** Markee-hosted API used by integrations unless overridden for local development. */
export const DEFAULT_MARKEE_API_URL = PRODUCTION_API_URL;

const PLATFORM_ADMIN_RETRY_MS = 10 * 60_000;
const WALLET_REJECTION_CODES = new Set([4001, 5750]);
const BATCH_UNSUPPORTED_CODES = new Set([4200, -32601, -32602, 5700, 5710, 5740, 5760]);
function walletHasCode(error: unknown, codes: ReadonlySet<number>): boolean {
  for (let e = error, depth = 0; e && typeof e === 'object' && depth < 8; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'number' && codes.has(code)) return true;
  }
  return false;
}
function isWalletRejection(error: unknown) { return walletHasCode(error, WALLET_REJECTION_CODES); }
function isBatchUnsupported(error: unknown) { return walletHasCode(error, BATCH_UNSUPPORTED_CODES); }

export class MarkeeError extends Error {
  constructor(message: string, public code = 'MARKEE_ERROR', public status?: number) { super(message); this.name = 'MarkeeError'; }
}
export interface DiscoveredWallet { name: string; uuid: string; provider: EIP1193Provider }
export async function discoverWallets(): Promise<DiscoveredWallet[]> {
  if (typeof window === 'undefined') return [];
  const wallets = new Map<string, DiscoveredWallet>();
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: { uuid: string; name: string }; provider?: EIP1193Provider }>).detail;
    if (detail?.provider?.request && typeof detail.info?.uuid === 'string') wallets.set(detail.info.uuid, { uuid: detail.info.uuid, name: String(detail.info.name).slice(0, 80), provider: detail.provider });
  };
  window.addEventListener('eip6963:announceProvider', listener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise(resolve => setTimeout(resolve, 150));
  window.removeEventListener('eip6963:announceProvider', listener);
  const legacy = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!wallets.size && legacy?.request) wallets.set('injected', { uuid: 'injected', name: 'Browser wallet', provider: legacy });
  return [...wallets.values()];
}
const isAddress = (value: unknown): value is Address => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);
const isHash = (value: unknown): value is Hex => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
export interface PendingTransaction { preparation: PreparedAction; hash: Hex }
export type PendingWalletOperation = PendingTransaction | WalletRecovery;
export interface PendingAuthorization { kind: 'activate' | 'claim' | 'platform-activate' | 'platform-activate-direct'; nonce: string; signature: Hex; account: Address; community?: Address; chainId: number; placement?: Placement }

export class MarkeeClient {
  readonly apiUrl: string;
  private readonly fetcher: typeof fetch;
  private injected: EIP1193Provider | null = null;
  private sending = false;
  private pendingOrigins = new Map<string, string>();
  private adminOrigin?: string;
  private inMemoryPending: PendingTransaction[] = [];
  private readonly recovery: WalletRecoveryStore;
  private adminMemory: PendingAuthorization | null = null;
  private communityReceipts: Record<string, AdminResult> = {};
  private adminAcceptanceMemory = new Map<string, { hash: Hex; at: number }>();
  constructor(readonly options: SDKOptions = {}) {
    const url = new URL(options.apiUrl ?? DEFAULT_MARKEE_API_URL);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new MarkeeError('Use an HTTPS Markee API URL (HTTP is allowed on localhost).');
    this.apiUrl = url.href.replace(/\/$/, '');
    this.recovery = new WalletRecoveryStore(this.apiUrl);
    this.fetcher = options.fetch || globalThis.fetch.bind(globalThis);
  }
  async request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    // Mark board reads and new preparations, not recovery requests tied to an
    // older API origin. The query is ignored by older v1 servers and avoids a
    // CORS preflight on public snapshots. It is not an authentication claim.
    const url = new URL(`${this.apiUrl}/${path}`);
    if (path === 'snapshot' || path.startsWith('snapshot?') || path === 'prepare') url.searchParams.set('client', `markee-sdk@${SDK_VERSION}`);
    const response = await this.fetcher(url.href, {
      method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'omit', signal: signal || AbortSignal.timeout(55_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new MarkeeError(data?.error || `Markee returned HTTP ${response.status}.`, data?.code, response.status);
    return data as T;
  }
  async provider(): Promise<EIP1193Provider | null> {
    return this.options.wallet ? this.options.wallet.getProvider() : this.injected;
  }
  async account(): Promise<Address | null> {
    const provider = await this.provider();
    if (!provider) return null;
    const accounts = await provider.request({ method: 'eth_accounts' });
    return Array.isArray(accounts) && isAddress(accounts[0]) ? accounts[0] : null;
  }
  async connect(selected?: EIP1193Provider): Promise<Address> {
    let provider = await this.provider();
    if (this.options.wallet) {
      if (!provider) provider = await this.options.wallet.connect?.() || null;
    } else {
      provider = selected || provider;
      if (!provider) {
        const wallets = await discoverWallets();
        if (wallets.length > 1) throw new MarkeeError('Select a browser wallet.', 'SELECT_WALLET');
        provider = wallets[0]?.provider || null;
      }
      this.injected = provider;
    }
    if (!provider) throw new MarkeeError('Connect a wallet in the app or install a browser wallet to continue.', 'NO_WALLET');
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || !isAddress(accounts[0])) throw new MarkeeError('The wallet did not return an account.');
    return accounts[0];
  }
  verifySite(placement: Placement, siteUrl: string): Promise<SiteVerification> {
    return this.request('sites/verify', { placement, siteUrl });
  }
  private siteRequests = new Map<string, Promise<SiteVerification>>();
  registerSite(placement: Placement): void {
    if (!this.options.siteUrl) return;
    const key = JSON.stringify([placement, this.options.siteUrl]);
    if (this.siteRequests.has(key)) return;
    const request = this.verifySite(placement, this.options.siteUrl);
    this.siteRequests.set(key, request);
    void request.then(result => this.options.onSiteVerification?.(result), error => this.options.onSiteVerification?.({ verified: false, url: this.options.siteUrl!, message: error instanceof Error ? error.message : 'Site verification failed.' })).catch(() => { /* Consumer callbacks must not interrupt the modal. */ });
  }
  async snapshot(placement: Placement, account?: Address | null, offset?: number, signal?: AbortSignal): Promise<Snapshot> {
    const params = new URLSearchParams({ placement: JSON.stringify(placement) });
    for (const [key, value] of Object.entries(moderationParams(this.options.moderation))) params.set(key, value);
    if (account) params.set('account', account);
    if (offset !== undefined) params.set('offset', String(offset));
    return this.request(`snapshot?${params}`, undefined, signal);
  }
  async prepare(placement: Placement, action: Action): Promise<PreparedAction> {
    const account = await this.account();
    if (!account) throw new MarkeeError('Connect your wallet first.', 'NOT_CONNECTED');
    return this.request('prepare', { placement, account, action, ...moderationParams(this.options.moderation) });
  }
  private async ensureWallet(account: Address, chainId: number): Promise<EIP1193Provider> {
    const provider = await this.provider();
    if (!provider || (await this.account())?.toLowerCase() !== account.toLowerCase()) throw new MarkeeError('Your wallet account changed. Review this action again.', 'ACCOUNT_CHANGED');
    let chain = Number(await provider.request({ method: 'eth_chainId' }));
    if (chain !== chainId) await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] });
    chain = Number(await provider.request({ method: 'eth_chainId' }));
    if (chain !== chainId || (await this.account())?.toLowerCase() !== account.toLowerCase()) throw new MarkeeError('The wallet account or network changed. Review again.', 'WALLET_CHANGED');
    return provider;
  }
  async send(preparation: PreparedAction): Promise<Hex> {
    if (this.sending) throw new MarkeeError('A wallet request is already in progress.');
    if (preparation.expiresAt <= Date.now()) throw new MarkeeError('This review expired. Prepare the action again.', 'REVIEW_EXPIRED');
    this.assertReviewNotConfirmed(preparation);
    const existing = this.pendingOperation(preparation.placement, preparation.transaction.from);
    if (existing) throw new MarkeeError('A transaction is still pending for this wallet and placement. Check it before submitting again.', 'PENDING_TRANSACTION');
    this.sending = true;
    try {
      const provider = await this.ensureWallet(preparation.transaction.from, preparation.transaction.chainId);
      if (preparation.expiresAt <= Date.now()) throw new MarkeeError('This review expired. Prepare the action again.', 'REVIEW_EXPIRED');
      this.recovery.set({ version: 2, phase: 'submitting', mode: 'direct', preparation, at: Date.now() });
      const { chainId: _, ...transaction } = preparation.transaction;
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [transaction] });
      if (!isHash(hash)) throw new MarkeeError('The wallet returned an unexpected transaction identifier. Check your wallet before retrying.');
      this.recovery.set({ version: 2, phase: 'direct-submitted', mode: 'direct', preparation, hash, at: Date.now() });
      this.persist([...this.records(), { preparation, hash }]);
      this.options.onEvent?.({ type: 'submitted', hash });
      return hash;
    } catch (error) {
      if (isWalletRejection(error)) this.recovery.clear(preparation);
      this.options.onEvent?.({ type: 'error', message: errorMessage(error) });
      throw error;
    } finally { this.sending = false; }
  }
  /** EIP-5792 capable wallets may return a batch ID before an on-chain hash exists. */
  async submit(preparation: PreparedAction): Promise<PendingWalletOperation> {
    if (this.sending) throw new MarkeeError('A wallet request is already in progress.');
    if (preparation.expiresAt <= Date.now()) throw new MarkeeError('This review expired. Prepare the action again.', 'REVIEW_EXPIRED');
    this.assertReviewNotConfirmed(preparation);
    if (this.pendingOperation(preparation.placement, preparation.transaction.from)) throw new MarkeeError(RECOVERY_BLOCKED, 'PENDING_TRANSACTION');
    const provider = await this.ensureWallet(preparation.transaction.from, preparation.transaction.chainId);
    const chainId = `0x${preparation.transaction.chainId.toString(16)}`;
    let atomic = false;
    try {
      const response = await provider.request({ method: 'wallet_getCapabilities', params: [preparation.transaction.from, [chainId]] });
      const capabilities = response && typeof response === 'object' ? response as Record<string, unknown> : {};
      const onChain = capabilities[chainId] && typeof capabilities[chainId] === 'object' ? capabilities[chainId] as Record<string, unknown> : capabilities;
      const status = onChain.atomic as { status?: unknown } | undefined;
      const legacy = onChain.atomicBatch as { supported?: unknown } | undefined;
      atomic = status?.status === 'supported' || legacy?.supported === true;
    } catch { /* Wallets without capability discovery keep the existing direct path. */ }
    if (!atomic) return { preparation, hash: await this.send(preparation) };
    if (this.sending || this.pendingOperation(preparation.placement, preparation.transaction.from)) throw new MarkeeError(RECOVERY_BLOCKED, 'PENDING_TRANSACTION');
    this.sending = true;
    try {
      if (preparation.expiresAt <= Date.now()) throw new MarkeeError('This review expired. Prepare the action again.', 'REVIEW_EXPIRED');
      this.recovery.set({ version: 2, phase: 'submitting', mode: 'batch', preparation, at: Date.now() });
      const tx = preparation.transaction;
      const response = await provider.request({ method: 'wallet_sendCalls', params: [{ version: '2.0.0', chainId, from: tx.from,
        atomicRequired: true, calls: [{ to: tx.to, data: tx.data, value: tx.value }] }] });
      const batchId = response && typeof response === 'object' ? (response as { id?: unknown }).id : undefined;
      if (typeof batchId !== 'string' || batchId.length > 258 || !/^0x[\da-f]+$/i.test(batchId)) throw new MarkeeError(RECOVERY_BLOCKED, 'BATCH_ID_UNKNOWN');
      const record: WalletRecovery = { version: 2, phase: 'batch-submitted', mode: 'batch', preparation, batchId, at: Date.now() };
      this.recovery.set(record);
      return record;
    } catch (error) {
      if (isWalletRejection(error) || isBatchUnsupported(error)) this.recovery.clear(preparation);
      if (isBatchUnsupported(error)) { this.sending = false; return { preparation, hash: await this.send(preparation) }; }
      this.options.onEvent?.({ type: 'error', message: errorMessage(error) });
      throw error;
    } finally { this.sending = false; }
  }
  pendingOperation(placement: Placement, account: Address): PendingWalletOperation | undefined {
    const legacy = this.pending(placement, account);
    if (legacy) return legacy;
    const record = this.recovery.forWallet(placement, account)?.record;
    return record?.phase === 'confirmed' ? undefined : record;
  }
  private assertReviewNotConfirmed(preparation: PreparedAction) {
    const record = this.recovery.forWallet(preparation.placement, preparation.transaction.from)?.record;
    if (record?.phase === 'confirmed' && record.preparation.id === preparation.id) throw new MarkeeError('This reviewed action already confirmed. Prepare a new action to pay again.', 'ALREADY_CONFIRMED');
  }
  async verifyOperation(operation: PendingWalletOperation): Promise<TransactionResult | null> {
    if ('phase' in operation && operation.phase === 'receipt-submitted') {
      const found = this.recovery.all().find(({ record }) => record.phase === 'receipt-submitted' && record.hash === operation.hash);
      if (!found) throw new MarkeeError('The recovery record is no longer available.', 'NO_RECOVERY');
      const result = await this.recoveryClient(found.origin).request<TransactionResult>('verify', {
        id: operation.preparation.id, hash: operation.hash, ...(operation.mode === 'batch' ? { mode: 'batch' } : {}),
      });
      if (result.status === 'confirmed' || operation.mode === 'direct' && result.status === 'reverted') {
        if (result.status === 'confirmed') this.recovery.set({ version: 2, phase: 'confirmed', mode: operation.mode, preparation: operation.preparation, hash: result.hash, at: Date.now() }, found.origin);
        else this.recovery.clear(operation.preparation, found.origin);
        if (result.status === 'confirmed') this.options.onEvent?.({ type: 'confirmed', hash: result.hash });
      }
      return result;
    }
    if ('hash' in operation) return this.verify(operation);
    if (operation.phase === 'submitting') return null;
    const found = this.recovery.all().find(({ record }) => record.phase === 'batch-submitted' && record.batchId === operation.batchId);
    if (!found) throw new MarkeeError('This wallet batch is no longer pending.', 'NO_RECOVERY');
    const client = this.recoveryClient(found?.origin);
    const provider = await this.provider();
    if (!provider || (await this.account())?.toLowerCase() !== operation.preparation.transaction.from.toLowerCase()) throw new MarkeeError('Reconnect the wallet that submitted this batch to check its status.', 'WALLET_CHANGED');
    const response = await provider.request({ method: 'wallet_getCallsStatus', params: [operation.batchId] });
    const status = response && typeof response === 'object' ? response as { id?: unknown; chainId?: unknown; status?: unknown; atomic?: unknown; receipts?: unknown } : {};
    if (typeof status.id !== 'string' || status.id.toLowerCase() !== operation.batchId.toLowerCase()
      || typeof status.chainId !== 'string' || status.chainId.toLowerCase() !== `0x${operation.preparation.transaction.chainId.toString(16)}`) throw new MarkeeError(RECOVERY_BLOCKED, 'BATCH_UNVERIFIED');
    if (status.status === 100) return null;
    if ((status.status !== 200 && status.status !== 500) || status.atomic !== true || !Array.isArray(status.receipts) || !status.receipts.length || status.receipts.length > 16) throw new MarkeeError(RECOVERY_BLOCKED, 'BATCH_UNVERIFIED');
    const expectedReceiptStatus = status.status === 200 ? '0x1' : '0x0';
    const receipts = status.receipts as { transactionHash?: unknown; status?: unknown }[];
    if (!receipts.every(receipt => isHash(receipt.transactionHash) && receipt.status === expectedReceiptStatus)) throw new MarkeeError(RECOVERY_BLOCKED, 'BATCH_UNVERIFIED');
    let awaiting = false;
    for (const receipt of receipts) {
      let result: TransactionResult;
      try { result = await client.request<TransactionResult>('verify', { id: operation.preparation.id, hash: receipt.transactionHash, mode: 'batch' }); }
      catch (error) { if (error instanceof MarkeeError && error.code === 'TRANSACTION_MISMATCH') continue; throw error; }
      if (result.status === 'pending') { awaiting = true; continue; }
      if (status.status === 500 && result.status === 'reverted') { this.recovery.clear(operation.preparation, found.origin); return result; }
      if (status.status !== 200 || result.status !== 'confirmed') throw new MarkeeError(RECOVERY_BLOCKED, 'BATCH_UNVERIFIED');
      this.recovery.set({ version: 2, phase: 'confirmed', mode: 'batch', preparation: operation.preparation, hash: result.hash, at: Date.now() }, found.origin);
      this.options.onEvent?.({ type: 'confirmed', hash: result.hash });
      return result;
    }
    if (awaiting) return null;
    throw new MarkeeError(RECOVERY_BLOCKED, 'BATCH_UNVERIFIED');
  }
  /** Attach a hash found in wallet activity to an ambiguous submission, then verify it on Markee's API. */
  async recoverOperation(operation: WalletRecovery, hash: Hex): Promise<TransactionResult | null> {
    if (!isHash(hash)) throw new MarkeeError('Enter an on-chain transaction hash.', 'INVALID_HASH');
    const found = this.recovery.all().find(({ record }) => record.preparation.id === operation.preparation.id);
    if (!found || found.record.phase !== 'submitting' && found.record.phase !== 'receipt-submitted') throw new MarkeeError('This request already has a wallet identifier. Check that transaction instead.', 'NO_RECOVERY');
    const record: WalletRecovery = { version: 2, phase: 'receipt-submitted', mode: operation.mode, preparation: operation.preparation, hash, at: Date.now() };
    this.recovery.set(record, found.origin);
    return this.verifyOperation(record);
  }
  async verify(pending: PendingTransaction): Promise<TransactionResult> {
    this.records();
    const recovered = this.recovery.all().find(({ record }) => record.phase === 'direct-submitted' && record.hash === pending.hash);
    const result = await this.recoveryClient(recovered?.origin ?? this.pendingOrigins.get(pending.hash)).request<TransactionResult>('verify', { id: pending.preparation.id, hash: pending.hash });
    if (result.status !== 'pending') {
      this.persist(this.records().filter(r => r.hash !== pending.hash));
      if (recovered) {
        if (result.status === 'confirmed') this.recovery.set({ version: 2, phase: 'confirmed', mode: 'direct', preparation: pending.preparation, hash: result.hash, at: Date.now() }, recovered.origin);
        else this.recovery.clear(pending.preparation, recovered.origin);
      }
      if (result.status === 'confirmed') this.options.onEvent?.({ type: 'confirmed', hash: result.hash });
    }
    return result;
  }
  /** Verify a speed-up replacement against the original prepared calldata before
   * retiring the old hash. Unknown/replaced transactions never authorize a retry. */
  async reconcile(pending: PendingTransaction, replacementHash: Hex): Promise<TransactionResult> {
    if (!isHash(replacementHash)) throw new MarkeeError('Enter a valid replacement transaction hash.');
    this.records();
    const recovered = this.recovery.all().find(({ record }) => record.phase === 'direct-submitted' && record.hash === pending.hash);
    const result = await this.recoveryClient(recovered?.origin ?? this.pendingOrigins.get(pending.hash)).request<TransactionResult>('verify', { id: pending.preparation.id, hash: replacementHash });
    if (result.status !== 'pending') {
      this.persist(this.records().filter(r => r.hash !== pending.hash));
      if (recovered) {
        if (result.status === 'confirmed') this.recovery.set({ version: 2, phase: 'confirmed', mode: 'direct', preparation: pending.preparation, hash: replacementHash, at: Date.now() }, recovered.origin);
        else this.recovery.clear(pending.preparation, recovered.origin);
      }
    }
    return result;
  }
  private storageKey(apiUrl = this.apiUrl) { return `markee:sdk:v1:pending:${apiUrl}`; }
  private recoveryClient(apiUrl?: string): MarkeeClient {
    return apiUrl && apiUrl !== this.apiUrl ? new MarkeeClient({ ...this.options, apiUrl }) : this;
  }
  private records(): PendingTransaction[] {
    const store = recoveryStorage();
    if (!store) return this.inMemoryPending;
    const records: PendingTransaction[] = [];
    for (const origin of storageOrigins(this.apiUrl)) {
      let raw: string | null;
      try { raw = store.getItem(this.storageKey(origin)); }
      catch { throw new MarkeeError(RECOVERY_STORAGE, 'STORAGE_UNAVAILABLE'); }
      if (!raw) continue;
      try {
        const saved: unknown = JSON.parse(raw);
        if (!Array.isArray(saved)) throw new Error('Invalid recovery records');
        for (const record of saved) {
          if (!isHash(record?.hash) || typeof record.preparation?.id !== 'string' || !isAddress(record.preparation?.transaction?.from) || !record.preparation?.placement) throw new Error('Invalid recovery record');
          if (records.some(r => r.hash === record.hash)) continue;
          records.push(record); this.pendingOrigins.set(record.hash, origin);
        }
      } catch { throw new MarkeeError(RECOVERY_BLOCKED, 'RECOVERY_UNREADABLE'); }
    }
    return records.length ? records : this.inMemoryPending;
  }
  private persist(records: PendingTransaction[]) {
    this.inMemoryPending = records;
    for (const origin of storageOrigins(this.apiUrl)) {
      try {
        recoveryStorage()?.setItem(this.storageKey(origin), JSON.stringify(records.filter(r => (this.pendingOrigins.get(r.hash) || this.apiUrl) === origin)));
      } catch { /* Keep the in-memory records; never automatically retry a payment. */ }
    }
  }
  pending(placement: Placement, account: Address): PendingTransaction | undefined {
    const recovered = this.recovery.forWallet(placement, account)?.record;
    if (recovered?.phase === 'direct-submitted') return { preparation: recovered.preparation, hash: recovered.hash };
    return this.records().find(r => sameWalletPlacement(r.preparation, placement, account));
  }
  async quote(placement: Extract<Placement, { kind: 'gardens-community' }>): Promise<ClaimQuote> {
    return this.request(`community/quote?${new URLSearchParams({ chainId: String(placement.chainId), community: placement.community })}`);
  }
  async authorize(placement: Extract<Placement, { kind: 'gardens-community' }>, kind: 'activate' | 'claim'): Promise<Authorization> {
    const account = await this.account();
    if (!account) throw new MarkeeError('Connect your community council wallet first.');
    return this.request(`community/${kind}`, { action: 'challenge', chainId: placement.chainId, community: placement.community, account });
  }
  async authorizePlatform(placement: Extract<Placement, { kind: 'platform-community' }>, strategy: 'sale' | 'rent', beneficiary: Address): Promise<Authorization> {
    const account = await this.account();
    if (!account) throw new MarkeeError('Connect the community owner wallet first.', 'NOT_CONNECTED');
    return this.request('platform/activate-direct', { action: 'challenge', placement, strategy, beneficiary, account });
  }
  /** The activator completes a factory's two-step board-admin handoff on Base. */
  async acceptPlatformAdmin(placement: Extract<Placement, { kind: 'platform-community' }>, board: Address): Promise<Hex> {
    const account = await this.account();
    if (!account) throw new MarkeeError('Connect the board owner wallet first.', 'NOT_CONNECTED');
    const state = await this.snapshot(placement, account);
    if (state.community?.integration.status !== 'pending_admin' || state.board?.toLowerCase() !== board.toLowerCase()
      || state.community.platform?.boardOwner?.toLowerCase() !== account.toLowerCase()) {
      throw new MarkeeError('This wallet is not the pending board owner.', 'NOT_AUTHORIZED');
    }
    if (this.pendingPlatformAdmin(placement, account)) {
      // The board is still pending_admin (checked above), so a stored hash that
      // is not confirmed after the window was dropped, replaced or is a Safe hash.
      const status = await this.platformAdminStatus(placement, account).catch(error => {
        if (error instanceof MarkeeError && error.code === 'TRANSACTION_MISMATCH') { this.savePlatformAdmin(placement, account, null); return 'reverted' as const; }
        throw error;
      });
      if (status === 'pending' && Date.now() - this.platformAdminSavedAt(placement, account) < PLATFORM_ADMIN_RETRY_MS) {
        throw new MarkeeError('Board ownership acceptance is still pending. Check its status before retrying.', 'ADMIN_PENDING');
      }
      this.savePlatformAdmin(placement, account, null);
    }
    const provider = await this.ensureWallet(account, 8453);
    const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: account, to: board, data: '0x0e18b681' }] });
    if (!isHash(hash)) throw new MarkeeError('Wallet did not return a transaction hash. Check its activity before retrying.');
    this.savePlatformAdmin(placement, account, hash);
    return hash;
  }
  private platformAdminKey(placement: Extract<Placement, { kind: 'platform-community' }>, account: Address): string {
    return `${this.storageKey()}:platform-admin-v1:${placement.platformId}:${placement.chainId}:${placement.communityId}:${account.toLowerCase()}`;
  }
  private savePlatformAdmin(placement: Extract<Placement, { kind: 'platform-community' }>, account: Address, hash: Hex | null) {
    const key = this.platformAdminKey(placement, account);
    const record = hash ? { hash, at: Date.now() } : null;
    if (record) this.adminAcceptanceMemory.set(key, record); else this.adminAcceptanceMemory.delete(key);
    try { if (typeof localStorage !== 'undefined') record ? localStorage.setItem(key, JSON.stringify(record)) : localStorage.removeItem(key); } catch { /* In-memory fallback. */ }
  }
  private platformAdminRecord(placement: Extract<Placement, { kind: 'platform-community' }>, account: Address): { hash: Hex; at: number } | null {
    const key = this.platformAdminKey(placement, account);
    try { if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(key);
      // Earlier SDK versions stored the bare hash; treat it as old enough to retry.
      if (isHash(saved)) return { hash: saved, at: 0 };
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && isHash(parsed.hash) && typeof parsed.at === 'number') return parsed;
    } } catch { /* In-memory fallback. */ }
    return this.adminAcceptanceMemory.get(key) || null;
  }
  private platformAdminSavedAt(placement: Extract<Placement, { kind: 'platform-community' }>, account: Address): number {
    return this.platformAdminRecord(placement, account)?.at ?? 0;
  }
  pendingPlatformAdmin(placement: Extract<Placement, { kind: 'platform-community' }>, account: Address): Hex | null {
    return this.platformAdminRecord(placement, account)?.hash ?? null;
  }
  async platformAdminStatus(placement: Extract<Placement, { kind: 'platform-community' }>, account: Address): Promise<'pending' | 'confirmed' | 'reverted'> {
    const transactionHash = this.pendingPlatformAdmin(placement, account);
    if (!transactionHash) throw new MarkeeError('No pending board-admin transaction.', 'NO_PENDING_ADMIN');
    const status = await this.request<{ status: 'pending' | 'confirmed' | 'reverted' }>(`platform/admin-status?${new URLSearchParams({ placement: JSON.stringify(placement), account, transactionHash })}`);
    if (status.status === 'confirmed' || status.status === 'reverted') this.savePlatformAdmin(placement, account, null);
    return status.status;
  }
  async executePlatformAuthorization(placement: Extract<Placement, { kind: 'platform-community' }>, authorization: Authorization, account: Address): Promise<AdminOperation> {
    if (this.pendingAuthorization()) throw new MarkeeError('An earlier community authorization is still processing. Check its status first.');
    const typedData = authorization.typedData;
    const provider = await this.ensureWallet(account, typedData.domain.chainId);
    const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [account, JSON.stringify({ ...typedData, types: { ...typedData.types, EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] } })] });
    if (typeof signature !== 'string' || !/^0x[\da-f]+$/i.test(signature)) throw new MarkeeError('Wallet did not return a typed-data signature.');
    this.saveAuthorization({ kind: 'platform-activate-direct', nonce: authorization.nonce, signature: signature as Hex, account, placement, chainId: placement.chainId });
    return this.resumeAuthorization();
  }
  async executeAuthorization(kind: 'activate' | 'claim', authorization: Authorization, account: Address): Promise<AdminOperation> {
    if (this.pendingAuthorization()) throw new MarkeeError('An earlier community authorization is still processing. Check its status first.');
    const typedData = authorization.typedData;
    const provider = await this.ensureWallet(account, typedData.domain.chainId);
    const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [account, JSON.stringify({ ...typedData, types: { ...typedData.types, EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] } })] });
    if (typeof signature !== 'string' || !/^0x[\da-f]+$/i.test(signature)) throw new MarkeeError('Wallet did not return a typed-data signature.');
    this.saveAuthorization({ kind, nonce: authorization.nonce, signature: signature as Hex, account, community: typedData.domain.verifyingContract, chainId: typedData.domain.chainId });
    return this.resumeAuthorization();
  }
  pendingAuthorization(): PendingAuthorization | null {
    if (typeof localStorage === 'undefined') return this.adminMemory;
    for (const origin of storageOrigins(this.apiUrl)) {
      try {
        const saved = JSON.parse(localStorage.getItem(`${this.storageKey(origin)}:admin`) || 'null');
        if (saved && ['activate', 'claim', 'platform-activate', 'platform-activate-direct'].includes(saved.kind) && isAddress(saved.account) && (saved.kind.startsWith('platform-activate') ? saved.placement?.kind === 'platform-community' : isAddress(saved.community)) && typeof saved.nonce === 'string' && typeof saved.signature === 'string') {
          this.adminOrigin = origin; return saved;
        }
      } catch { /* Continue searching the known prior API. */ }
    }
    this.adminOrigin = this.apiUrl;
    return this.adminMemory;
  }
  private saveAuthorization(value: PendingAuthorization | null) {
    this.adminMemory = value;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(`${this.storageKey(this.adminOrigin)}:admin`, JSON.stringify(value)); } catch { /* Keep the in-memory authorization for recovery. */ }
  }
  async resumeAuthorization(): Promise<AdminOperation> {
    const pending = this.pendingAuthorization();
    if (!pending) throw new MarkeeError('There is no pending community authorization.');
    const route = pending.kind === 'platform-activate-direct' ? 'platform/activate-direct'
      : pending.kind === 'platform-activate' ? 'platform/activate' : `community/${pending.kind}`;
    let op: AdminOperation;
    try {
      op = await this.recoveryClient(this.adminOrigin).request<AdminOperation>(route, { action: 'verify', nonce: pending.nonce, signature: pending.signature });
    } catch (error) {
      // The retired preview flow has no operation to resume; drop it so it cannot block new authorizations.
      if (error instanceof MarkeeError && error.code === 'PLATFORM_UPGRADE_REQUIRED') this.saveAuthorization(null);
      throw error;
    }
    if (op.status === 'complete' && op.result && pending.community) {
      const key = `${pending.chainId}:${pending.community.toLowerCase()}`;
      this.communityReceipts[key] = op.result;
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(`${this.storageKey()}:community:${key}`, JSON.stringify(op.result)); } catch { /* Session fallback. */ }
    }
    if (op.status === 'complete' || op.status === 'failed') this.saveAuthorization(null);
    return op;
  }
  communityReceipt(placement: Extract<Placement, { kind: 'gardens-community' }>): AdminResult | null {
    const key = `${placement.chainId}:${placement.community.toLowerCase()}`;
    for (const origin of storageOrigins(this.apiUrl)) {
      try {
        const value = typeof localStorage === 'undefined' ? this.communityReceipts[key] : JSON.parse(localStorage.getItem(`${this.storageKey(origin)}:community:${key}`) || 'null');
        if (value && isHash(value.transactionHash)) return value;
      } catch { /* Continue searching the known prior API. */ }
    }
    return this.communityReceipts[key] || null;
  }

  bridgeStatus(protocol: ClaimQuote['bridgeProtocol'], hash: Hex, fromChainId: number, toChainId: number): Promise<BridgeStatus> {
    return this.request(`community/status?${new URLSearchParams({ protocol, transactionHash: hash, fromChainId: String(fromChainId), toChainId: String(toChainId) })}`);
  }
  async checkMessage(message: string, placement?: Placement): Promise<MessageCheck> {
    const moderation = moderationParams(this.options.moderation);
    try { return await this.request('moderation/check', { kind: 'draft', message, ...(placement ? { placement } : {}), ...moderation }); }
    catch (error) { if (!Object.keys(moderation).length && error instanceof MarkeeError && error.status === 404) return { enabled: false, state: 'pass', contentHash: '', engine: '', policyVersion: '' }; throw error; }
  }
  recordView(address: Address, message: string, url?: string): Promise<{ counted: boolean; totalViews: number }> {
    return this.request('views', { address, message, url, ...moderationParams(this.options.moderation) });
  }
}
