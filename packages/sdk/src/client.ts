import { PRODUCTION_API_URL, storageOrigins } from './storage-origins.js';
import { errorMessage } from './errors.js';
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
export interface PendingAuthorization { kind: 'activate' | 'claim'; nonce: string; signature: Hex; account: Address; community: Address; chainId: number }

export class MarkeeClient {
  readonly apiUrl: string;
  private readonly fetcher: typeof fetch;
  private injected: EIP1193Provider | null = null;
  private sending = false;
  private pendingOrigins = new Map<string, string>();
  private adminOrigin?: string;
  private inMemoryPending: PendingTransaction[] = [];
  private adminMemory: PendingAuthorization | null = null;
  private communityReceipts: Record<string, AdminResult> = {};
  constructor(readonly options: SDKOptions = {}) {
    const url = new URL(options.apiUrl ?? DEFAULT_MARKEE_API_URL);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new MarkeeError('Use an HTTPS Markee API URL (HTTP is allowed on localhost).');
    this.apiUrl = url.href.replace(/\/$/, '');
    this.fetcher = options.fetch || globalThis.fetch.bind(globalThis);
  }
  async request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.fetcher(`${this.apiUrl}/${path}`, {
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
    const existing = this.pending(preparation.placement, preparation.transaction.from);
    if (existing) throw new MarkeeError('A transaction is still pending for this wallet and placement. Check it before submitting again.', 'PENDING_TRANSACTION');
    this.sending = true;
    try {
      const provider = await this.ensureWallet(preparation.transaction.from, preparation.transaction.chainId);
      if (preparation.expiresAt <= Date.now()) throw new MarkeeError('This review expired. Prepare the action again.', 'REVIEW_EXPIRED');
      const { chainId: _, ...transaction } = preparation.transaction;
      const hash = await provider.request({ method: 'eth_sendTransaction', params: [transaction] });
      if (!isHash(hash)) throw new MarkeeError('The wallet returned an unexpected transaction identifier. Check your wallet before retrying.');
      this.persist([...this.records(), { preparation, hash }]);
      this.options.onEvent?.({ type: 'submitted', hash });
      return hash;
    } catch (error) {
      this.options.onEvent?.({ type: 'error', message: errorMessage(error) });
      throw error;
    } finally { this.sending = false; }
  }
  async verify(pending: PendingTransaction): Promise<TransactionResult> {
    this.records();
    const result = await this.recoveryClient(this.pendingOrigins.get(pending.hash)).request<TransactionResult>('verify', { id: pending.preparation.id, hash: pending.hash });
    if (result.status !== 'pending') {
      this.persist(this.records().filter(r => r.hash !== pending.hash));
      if (result.status === 'confirmed') this.options.onEvent?.({ type: 'confirmed', hash: result.hash });
    }
    return result;
  }
  /** Verify a speed-up replacement against the original prepared calldata before
   * retiring the old hash. Unknown/replaced transactions never authorize a retry. */
  async reconcile(pending: PendingTransaction, replacementHash: Hex): Promise<TransactionResult> {
    if (!isHash(replacementHash)) throw new MarkeeError('Enter a valid replacement transaction hash.');
    this.records();
    const result = await this.recoveryClient(this.pendingOrigins.get(pending.hash)).request<TransactionResult>('verify', { id: pending.preparation.id, hash: replacementHash });
    if (result.status !== 'pending') this.persist(this.records().filter(r => r.hash !== pending.hash));
    return result;
  }
  private storageKey(apiUrl = this.apiUrl) { return `markee:sdk:v1:pending:${apiUrl}`; }
  private recoveryClient(apiUrl?: string): MarkeeClient {
    return apiUrl && apiUrl !== this.apiUrl ? new MarkeeClient({ ...this.options, apiUrl }) : this;
  }
  private records(): PendingTransaction[] {
    if (typeof localStorage === 'undefined') return this.inMemoryPending;
    const records: PendingTransaction[] = [];
    for (const origin of storageOrigins(this.apiUrl)) {
      try {
        const saved = JSON.parse(localStorage.getItem(this.storageKey(origin)) || '[]');
        if (!Array.isArray(saved)) continue;
        for (const record of saved) {
          if (!isHash(record?.hash) || typeof record.preparation?.id !== 'string' || !isAddress(record.preparation?.transaction?.from) || !record.preparation?.placement || records.some(r => r.hash === record.hash)) continue;
          records.push(record); this.pendingOrigins.set(record.hash, origin);
        }
      } catch { /* A corrupt/unavailable store must not hide other recoverable records. */ }
    }
    return records.length ? records : this.inMemoryPending;
  }
  private persist(records: PendingTransaction[]) {
    this.inMemoryPending = records;
    for (const origin of storageOrigins(this.apiUrl)) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(this.storageKey(origin), JSON.stringify(records.filter(r => (this.pendingOrigins.get(r.hash) || this.apiUrl) === origin)));
      } catch { /* Keep the in-memory records; never automatically retry a payment. */ }
    }
  }
  pending(placement: Placement, account: Address): PendingTransaction | undefined {
    return this.records().find(r => JSON.stringify(r.preparation.placement).toLowerCase() === JSON.stringify(placement).toLowerCase() && r.preparation.transaction.from.toLowerCase() === account.toLowerCase());
  }
  async quote(placement: Extract<Placement, { kind: 'gardens-community' }>): Promise<ClaimQuote> {
    return this.request(`community/quote?${new URLSearchParams({ chainId: String(placement.chainId), community: placement.community })}`);
  }
  async authorize(placement: Extract<Placement, { kind: 'gardens-community' }>, kind: 'activate' | 'claim'): Promise<Authorization> {
    const account = await this.account();
    if (!account) throw new MarkeeError('Connect your community council wallet first.');
    return this.request(`community/${kind}`, { action: 'challenge', chainId: placement.chainId, community: placement.community, account });
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
        if (saved && ['activate', 'claim'].includes(saved.kind) && isAddress(saved.account) && isAddress(saved.community) && typeof saved.nonce === 'string' && typeof saved.signature === 'string') {
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
    const op = await this.recoveryClient(this.adminOrigin).request<AdminOperation>(`community/${pending.kind}`, { action: 'verify', nonce: pending.nonce, signature: pending.signature });
    if (op.status === 'complete' && op.result) {
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
