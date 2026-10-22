import { openHostedCheckout } from './checkout.js';
import { discoverWallets, MarkeeClient, type DiscoveredWallet, type PendingTransaction } from './client.js';
import { escapeHtml as e, formatEth, parseEth, shortAddress } from './amount.js';
import { styles } from './styles.js';
import { createThemeController } from './theme.js';
import { fundingPresets, MONTH } from './presentation.js';
import type { MarkeeTheme } from './types.js';
import type { Action, Address, AdminOperation, AdminResult, Authorization, EIP1193Provider, Entry, Placement, PreparedAction, SDKOptions, Snapshot, TransactionResult } from './types.js';

export interface ModalOptions { placement: Placement; onClose?: () => void; theme?: MarkeeTheme }
type FormState = { kind: 'fund' | 'stream' | 'edit-message' | 'edit-name'; entry: Entry };
const exact = (raw: string) => { const n = BigInt(raw); return `${n / 10n ** 18n}.${(n % 10n ** 18n).toString().padStart(18, '0')}`.replace(/\.?0+$/, '') || '0'; };
const btn = (cmd: string, label: string, cls = '', attrs = '') => `<button type="button" class="btn ${cls}" data-cmd="${cmd}" ${attrs}>${label}</button>`;
const link = (url: string, label: string) => /^https:\/\//.test(url) ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : '';

export class MarkeeModal {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private theme: ReturnType<typeof createThemeController>;
  private snapshot?: Snapshot;
  private cardAvailable = false;
  private checkoutChecked = false;
  private account: Address | null = null;
  private tab = 'main';
  private leaderboardOpen = false;
  private initialSelection = false;
  private renderedView = '';
  private form?: FormState;
  private review?: PreparedAction;
  private authorization?: { kind: 'activate' | 'claim'; value: Authorization; account: Address };
  private adminResult?: AdminResult;
  private adminProcessing = false;
  private result?: TransactionResult;
  private pending?: PendingTransaction;
  private wallets?: DiscoveredWallet[];
  private busy = false;
  private error = '';
  private closed = false;
  private epoch = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private accountTimer?: ReturnType<typeof setTimeout>;
  private watched?: EIP1193Provider;
  private previousFocus: HTMLElement | null;
  private previousOverflow: string;
  private abort = new AbortController();
  private drafts = new Map<string, Record<string, string>>();
  private viewObserver?: IntersectionObserver;
  private viewed = new Set<string>();
  private walletChanged = () => {
    this.initialSelection = false;
    this.review = undefined; this.authorization = undefined; this.form = undefined; this.tab = 'main';
    this.result = undefined; this.error = 'Wallet changed. Refreshing this placement…';
    void this.reload();
  };
  constructor(readonly client: MarkeeClient, readonly options: ModalOptions) {
    if (typeof document === 'undefined') throw new Error('Open the Markee modal in a browser.');
    client.registerSite(options.placement);
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.host = document.createElement('div');
    this.host.setAttribute('data-markee-modal', '');
    this.root = this.host.attachShadow({ mode: 'open' });
    this.theme = createThemeController(this.host, options.theme ?? client.options.theme);
    document.body.appendChild(this.host);
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('submit', this.onSubmit);
    this.root.addEventListener('keydown', this.onKey);
    this.root.addEventListener('input', () => { this.captureDraft(); this.updateFields(); });
    void client.request<{ enabled: boolean }>('checkout/config').then(config => { this.cardAvailable = config.enabled; }).catch(() => {}).finally(() => { this.checkoutChecked = true; this.render(); });
    this.render(); this.root.querySelector<HTMLButtonElement>('[data-cmd="close"]')?.focus(); void this.reload(); void this.watchAccount();
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.abort.abort(); clearTimeout(this.timer); clearTimeout(this.accountTimer);
    this.viewObserver?.disconnect();
    this.theme.destroy();
    this.watched?.removeListener?.('accountsChanged', this.walletChanged);
    this.watched?.removeListener?.('chainChanged', this.walletChanged);
    this.host.remove(); document.body.style.overflow = this.previousOverflow;
    this.previousFocus?.focus(); this.options.onClose?.();
  }
  /** Replace the theme without resetting the active form, wallet, or transaction. */
  setTheme(theme?: MarkeeTheme) { if (!this.closed) this.theme.set(theme); }
  private async watchAccount() {
    try {
      const provider = await this.client.provider();
      if (provider !== this.watched) {
        this.watched?.removeListener?.('accountsChanged', this.walletChanged);
        this.watched?.removeListener?.('chainChanged', this.walletChanged);
        this.watched = provider || undefined;
        provider?.on?.('accountsChanged', this.walletChanged); provider?.on?.('chainChanged', this.walletChanged);
      }
      const account = await this.client.account();
      if (account?.toLowerCase() !== this.account?.toLowerCase() && !this.busy) this.walletChanged();
    } catch { /* A disconnected wallet does not prevent public browsing. */ }
    if (!this.closed) this.accountTimer = setTimeout(() => void this.watchAccount(), 2000);
  }
  private async reload(offset?: number) {
    const epoch = ++this.epoch;
    try {
      const account = await this.client.account().catch(() => null);
      const data = await this.client.snapshot(this.options.placement, account, offset, this.abort.signal);
      if (this.closed || epoch !== this.epoch) return;
      this.account = account; this.snapshot = data; this.error = '';
      if (this.form) this.form.entry = data.entries.find(entry => entry.address.toLowerCase() === this.form!.entry.address.toLowerCase()) ?? this.form.entry;
      if (!this.initialSelection && account) {
        this.initialSelection = true;
        const entry = data.entries.find(entry => entry.address.toLowerCase() === data.wallet?.backedMarkee?.toLowerCase())
          ?? data.entries.find(entry => entry.owner.toLowerCase() === account.toLowerCase());
        if (entry && !this.form && !this.drafts.get('create')?.message) this.form = { kind: data.strategy === 'rent' ? 'stream' : 'fund', entry };
      }
      if (this.options.placement.kind === 'gardens-community') this.adminResult = this.client.communityReceipt(this.options.placement) || undefined;
      this.pending = account ? this.client.pending(this.options.placement, account) : undefined;
      const auth = this.client.pendingAuthorization();
      this.adminProcessing = !!auth && this.options.placement.kind === 'gardens-community' && auth.account.toLowerCase() === account?.toLowerCase() && auth.community.toLowerCase() === this.options.placement.community.toLowerCase() && auth.chainId === this.options.placement.chainId;
      this.render();
      if (this.pending) void this.poll();
    } catch (error) { if (!this.closed && epoch === this.epoch) this.fail(error); }
  }
  private fail(error: unknown) { this.error = error instanceof Error ? error.message : String(error); this.render(); }
  private async task(work: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.render();
    try { await work(); } catch (error) { this.fail(error); }
    finally { this.busy = false; this.render(); }
  }
  private async connect() {
    if (!this.client.options.wallet) {
      const wallets = await discoverWallets();
      if (wallets.length > 1) { this.wallets = wallets; this.render(); return; }
    }
    // ConnectKit renders in the host document. Temporarily release our overlay while
    // the host's wallet picker is open, so neither focus nor stacking blocks it.
    this.host.style.visibility = 'hidden';
    try { await this.client.connect(); } finally { this.host.style.visibility = ''; }
    await this.reload();
  }
  private async prepare(action: Action) {
    if (this.pending) throw new Error('Check your pending transaction before preparing another action.');
    if (!this.account) { await this.connect(); return; }
    this.review = await this.client.prepare(this.options.placement, action);
    this.authorization = undefined;
  }
  private async poll() {
    clearTimeout(this.timer);
    if (!this.pending || this.closed) return;
    try {
      const pending = this.pending;
      const result = await this.client.verify(pending);
      if (this.closed || this.pending?.hash !== pending.hash) return;
      if (result.status !== 'pending') {
        this.pending = undefined; this.result = result; this.error = '';
        await this.reload();
        if (result.createdMarkee && this.snapshot?.strategy === 'rent') {
          const entry = this.snapshot.entries.find(entry => entry.address.toLowerCase() === result.createdMarkee!.toLowerCase());
          // Newly created zero-rate entries may not rank in the first page.
          const action = pending.preparation.action;
          if (action.kind === 'create') {
            this.form = { kind: 'stream', entry: entry || { address: result.createdMarkee, owner: pending.preparation.transaction.from, message: action.message, name: action.name, score: '0', totalFunds: '0', aggregateRate: '0', legacyFloor: '0', moderated: false, views: 0 } };
            const amount = this.drafts.get('create')?.amount;
            if (amount) this.drafts.set(this.draftKey(), { amount });
          }
        }
        this.render(); return;
      }
    } catch (error) { if (!this.closed) this.fail(error); }
    if (!this.closed && this.pending) this.timer = setTimeout(() => void this.poll(), 5000);
  }
  private async applyAdmin(op: AdminOperation) {
    this.authorization = undefined;
    this.adminProcessing = op.status === 'working' || op.status === 'submitted';
    if (op.status === 'complete') { this.adminResult = op.result; await this.reload(); }
    if (op.status === 'failed') throw new Error(op.error || 'Community action failed.');
  }
  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    if (!button) return;
    const cmd = button.dataset.cmd!;
    if (cmd === 'close') { this.close(); return; }
    if (this.busy) return;
    this.captureDraft();
    if (cmd === 'leaderboard') { this.leaderboardOpen = !this.leaderboardOpen; this.render(); return; }
    if (cmd === 'create') { this.tab = 'main'; this.form = undefined; this.review = undefined; this.render(); return; }
    if (cmd.startsWith('tab:')) { this.tab = cmd.slice(4); this.review = undefined; this.authorization = undefined; this.render(); return; }
    if (cmd === 'back') {
      if (this.review || this.authorization || this.wallets) { this.review = undefined; this.authorization = undefined; this.wallets = undefined; }
      else if (this.tab !== 'main') this.tab = 'main';
      else if (this.form?.kind.startsWith('edit')) this.form = { kind: this.snapshot!.strategy === 'rent' ? 'stream' : 'fund', entry: this.form.entry };
      else this.form = undefined;
      this.render(); return;
    }
    if (cmd.startsWith('preset:') && this.snapshot) {
      const field = this.root.querySelector<HTMLInputElement>('#amount');
      if (field) {
        const presets = fundingPresets(this.snapshot, this.form?.entry);
        field.value = exact((cmd === 'preset:min' ? presets.minimum : presets.boost).toString());
        this.captureDraft(); this.updateFields();
      }
      return;
    }
    if (cmd.startsWith('form:')) {
      const [, kind, address] = cmd.split(':');
      const entry = this.snapshot?.entries.find(r => r.address === address);
      if (entry) { this.form = { kind: kind as FormState['kind'], entry }; this.tab = 'main'; }
      this.render(); return;
    }
    if (cmd === 'card' && this.hostedEligible() && this.cardAvailable) {
      this.captureDraft();
      const form = this.root.querySelector<HTMLFormElement>('#markee-action');
      if (!form || !form.reportValidity()) return;
      const fields = new FormData(form);
      let action: Action;
      try {
        const amount = parseEth(String(fields.get('amount') || ''));
        action = this.form?.kind === 'fund' ? { kind: 'fund', markee: this.form.entry.address, amount } : { kind: 'create', message: String(fields.get('message') || ''), name: String(fields.get('name') || ''), amount };
      } catch (error) { this.error = (error as Error).message; this.render(); return; }
      // Start synchronously from the gesture so mobile browsers can open the popup.
      const payment = openHostedCheckout(this.client, this.options.placement, action);
      void this.task(async () => {
        const result = await payment;
        if (result.status !== 'confirmed') throw new Error('Payment was not confirmed.');
        this.result = result;
        this.client.options.onEvent?.({ type: 'confirmed', hash: result.hash });
        await this.reload();
      });
      return;
    }
    void this.task(async () => {
      if (cmd === 'connect') await this.connect();
      else if (cmd.startsWith('wallet:')) { await this.client.connect(this.wallets![Number(cmd.slice(7))].provider); this.wallets = undefined; await this.reload(); }
      else if (cmd === 'refresh') await this.reload();
      else if (cmd === 'more') await this.reload(this.snapshot?.nextOffset ?? undefined);
      else if (cmd === 'send' && this.review) {
        const preparation = this.review;
        const hash = await this.client.send(preparation);
        this.pending = { preparation, hash }; this.review = undefined; this.form = undefined; this.result = undefined;
        void this.poll();
      } else if (cmd === 'check') await this.poll();
      else if (['stop', 'withdraw-buffer', 'settle'].includes(cmd)) await this.prepare({ kind: cmd } as Action);
      else if (cmd.startsWith('claim-refund:') || cmd.startsWith('connect-refund:') || cmd.startsWith('claim-top:')) {
        const [kind, markee] = cmd.split(':'); await this.prepare({ kind, markee } as Action);
      } else if (cmd === 'activate' || cmd === 'claim') {
        const placement = this.options.placement;
        if (placement.kind !== 'gardens-community' || !this.account) return;
        const account = this.account;
        this.authorization = { kind: cmd, account, value: await this.client.authorize(placement, cmd) };
        this.review = undefined;
      } else if (cmd === 'sign' && this.authorization) {
        const auth = this.authorization;
        try { await this.applyAdmin(await this.client.executeAuthorization(auth.kind, auth.value, auth.account)); }
        finally { if (this.client.pendingAuthorization()) { this.authorization = undefined; this.adminProcessing = true; } }
      } else if (cmd === 'admin-check') {
        await this.applyAdmin(await this.client.resumeAuthorization());
      } else if (cmd === 'bridge' && this.adminResult) {
        const result = await this.client.bridgeStatus(this.adminResult.bridgeProtocol || 'none', this.adminResult.transactionHash, this.snapshot!.chainId, this.options.placement.chainId);
        this.error = `Treasury transfer status: ${result.status.replace(/_/g, ' ')}.`;
      }
    });
  };
  private onSubmit = (event: Event) => {
    event.preventDefault(); if (this.busy) return;
    if (!this.account) { this.root.querySelector<HTMLButtonElement>('[data-cmd="card"]:not(:disabled)')?.click(); return; }
    this.captureDraft();
    const form = event.target as HTMLFormElement;
    const fields = new FormData(form);
    const value = (key: string) => String(fields.get(key) || '');
    void this.task(async () => {
      if (form.dataset.form === 'create') {
        if (this.snapshot?.strategy === 'rent') parseEth(value('amount'));
        await this.prepare({ kind: 'create', message: value('message'), name: value('name'), ...(this.snapshot?.strategy === 'sale' ? { amount: parseEth(value('amount'), true) } : {}) });
      }
      else if (form.dataset.form === 'balance') await this.prepare({ kind: value('kind') as 'wrap' | 'unwrap', amount: parseEth(value('amount')) });
      else if (this.form) {
        const { kind, entry } = this.form;
        if (kind === 'fund') await this.prepare({ kind, markee: entry.address, amount: parseEth(value('amount')) });
        else if (kind === 'stream') await this.prepare({ kind, markee: entry.address, monthlyAmount: parseEth(value('amount')) });
        else if (kind === 'edit-message') await this.prepare({ kind, markee: entry.address, message: value('message') });
        else await this.prepare({ kind, markee: entry.address, name: value('name') });
      }
    });
  };
  private draftKey() { return this.tab !== 'main' ? this.tab : this.form ? `${this.form.kind}:${this.form.entry.address}` : 'create'; }
  private captureDraft() {
    const form = this.root.querySelector<HTMLFormElement>('form');
    if (form) this.drafts.set(this.draftKey(), Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v)])));
  }
  private onKey = (event: Event) => {
    const key = event as KeyboardEvent;
    if (key.key === 'Escape') { key.preventDefault(); this.close(); }
    if (key.key !== 'Tab' || this.host.style.visibility === 'hidden') return;
    const focusable = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (key.shiftKey && this.root.activeElement === first) { key.preventDefault(); last?.focus(); }
    else if (!key.shiftKey && this.root.activeElement === last) { key.preventDefault(); first?.focus(); }
  };
  private field(name: string, label: string, initial = '', hint = '', textarea = false) {
    const limit = name === 'message' ? this.snapshot?.maxMessageBytes : name === 'name' ? this.snapshot?.maxNameBytes : undefined;
    const attrs = `${name === 'name' ? '' : 'required'} ${limit === undefined ? '' : `data-byte-limit="${limit}"`} aria-describedby="${name}-hint"`;
    return `<div class="field"><label for="${name}">${label}${limit === undefined ? '' : `<span class="field-count" aria-hidden="true" data-count-for="${name}"></span>`}</label>${textarea ? `<textarea id="${name}" name="${name}" ${attrs} placeholder="Your message on the sign">${e(initial)}</textarea>` : `<input id="${name}" name="${name}" ${name === 'amount' ? 'inputmode="decimal"' : ''} value="${e(initial)}" ${attrs}>`}${hint ? `<small id="${name}-hint">${hint}</small>` : ''}</div>`;
  }
  private reviewHtml() {
    const review = this.review!, action = review.action;
    const message = action.kind === 'create' || action.kind === 'edit-message' ? action.message : this.form ? this.entryMessage(this.form.entry) : undefined;
    const details = review.review.lines.filter(line => !line.startsWith('Message: '));
    return `<h2 class="review-title">${e(review.review.title)}</h2>${message ? `<section class="message-card"><p class="message">${e(message)}</p></section>` : ''}<section class="review"><ul>${details.map(line => `<li>${e(line)}</li>`).join('')}</ul><div class="stat"><span>Estimated network fee</span><strong>${formatEth(review.review.estimatedGasCost)} ETH</strong></div><div class="stat"><span>Wallet</span><strong class="mono">${shortAddress(review.transaction.from)}</strong></div></section><p class="note">${e(review.review.reward)}</p><p class="meta">This review expires in 5 minutes. Your wallet shows the final network fee.</p>`;
  }
  private authorizationHtml() {
    const auth = this.authorization!, message = auth.value.typedData.message;
    return `<div class="eyebrow">Community authorization</div><h2>${auth.kind === 'activate' ? 'Activate this community’s Markee' : 'Claim community revenue'}</h2><p>A signed authorization lets Markee’s keeper execute this action. The server rechecks your current council role before submitting it.</p><div class="card stack">${['registryCommunity', 'recipient', 'leaderboardFactory'].filter(k => message[k]).map(k => `<div class="meta">${e(k)}<br><strong class="mono">${e(message[k])}</strong></div>`).join('')}${['claimAmount', 'gasCost', 'maxFeeAmount'].filter(k => message[k] !== undefined).map(k => `<div class="stat"><span>${k === 'claimAmount' ? 'Revenue' : k === 'gasCost' ? 'Keeper network fee' : 'Maximum bridge fee'}</span><strong>${formatEth(String(message[k]))} ETH</strong></div>`).join('')}</div><p class="note">${auth.kind === 'claim' ? 'Revenue is sent to the community council treasury. Bridged claims remain pending until destination delivery is confirmed.' : 'This creates the community board and its revenue vault on the Markee chain.'}</p>`;
  }
  private entryMessage(entry: Entry) {
    return entry.moderated === false ? entry.message : entry.moderated ? 'This message is hidden by moderation.' : 'Message unavailable while moderation loads.';
  }
  private entriesHtml() {
    const s = this.snapshot!;
    const ranked = [...s.entries].sort((a, b) => BigInt(a.score) > BigInt(b.score) ? -1 : BigInt(a.score) < BigInt(b.score) ? 1 : 0);
    const entries = [...ranked.filter(entry => entry.owner.toLowerCase() === this.account?.toLowerCase()), ...ranked.filter(entry => entry.owner.toLowerCase() !== this.account?.toLowerCase())];
    const appUrl = s.board && [8453, 11155111].includes(s.chainId) ? `https://${s.chainId === 8453 ? 'www' : '2staging'}.markee.xyz/markee/${s.board}` : '';
    return `<section class="leaderboard" aria-label="Markee leaderboard"><div class="row between">${btn('leaderboard', `<span class="chevron" aria-hidden="true">${this.leaderboardOpen ? '⌃' : '⌄'}</span> Leaderboard`, 'text-button', `aria-expanded="${this.leaderboardOpen}" aria-controls="markee-leaderboard"`)}${link(appUrl, 'Open in Markee')}</div>${this.leaderboardOpen ? `<div class="leaderboard-list" id="markee-leaderboard">${entries.map(entry => {
      const own = entry.owner.toLowerCase() === this.account?.toLowerCase();
      const top = entry.address.toLowerCase() === s.top?.toLowerCase();
      const selected = entry.address.toLowerCase() === this.form?.entry.address.toLowerCase();
      return `<article class="leaderboard-entry ${top ? 'winner' : ''} ${selected ? 'selected-entry' : ''}"><div class="grow"><p class="message">${e(this.entryMessage(entry))}</p><div class="row entry-caption">${top ? '<span class="pill">Winner</span>' : ''}${own ? '<span class="meta">Yours</span>' : ''}${entry.moderated === false && entry.name ? `<span class="name">${e(entry.name)}</span>` : ''}</div></div><div class="entry-funding"><div class="meta mono">${s.strategy === 'rent' ? `${formatEth((BigInt(entry.score) * MONTH).toString())} ETH/mo` : `${formatEth(entry.totalFunds)} ETH`}</div><span class="meta">${entry.views === null ? 'Views unavailable' : `${entry.views.toLocaleString()} views`}</span>${btn(`form:${s.strategy === 'sale' ? 'fund' : 'stream'}:${entry.address}`, selected ? 'Selected' : 'Fund', `compact ${selected ? 'primary' : ''}`, `aria-pressed="${selected}" aria-label="${selected ? 'Selected' : 'Fund'} message ${shortAddress(entry.address)}"`)}</div></article>`;
    }).join('') || '<p class="empty">No Markees yet. Create the first one.</p>'}${s.strategy === 'rent' && s.rankedTop && s.rankedTop.toLowerCase() !== s.top?.toLowerCase() ? `<p class="note">The ranking has changed. ${btn(`claim-top:${s.rankedTop}`, 'Refresh winner', 'compact')}</p>` : ''}${s.nextOffset !== null ? btn('more', 'Browse more messages', 'full') : ''}</div>` : ''}</section>`;
  }
  private selectedMessageHtml(entry: Entry) {
    const s = this.snapshot!, w = s.wallet;
    const own = entry.owner.toLowerCase() === this.account?.toLowerCase();
    const owned = s.entries.find(item => item.owner.toLowerCase() === this.account?.toLowerCase());
    const top = entry.address.toLowerCase() === s.top?.toLowerCase();
    const backing = entry.address.toLowerCase() === w?.backedMarkee?.toLowerCase() && BigInt(w?.flowRate ?? '0') > 0n;
    return `<section class="message-card ${top ? 'winner' : ''}"><div class="row between"><span class="eyebrow">${own ? 'Your Markee' : 'Markee you’re funding'}</span>${top ? '<span class="pill">Winner</span>' : ''}</div><p class="message">${e(this.entryMessage(entry))}</p>${entry.moderated === false && entry.name ? `<p class="name">${e(entry.name)}</p>` : ''}<div class="row message-tools">${own ? btn(`form:edit-message:${entry.address}`, 'Edit message', 'text-button') + btn(`form:edit-name:${entry.address}`, 'Edit name', 'text-button') : ''}${!own && owned ? btn(`form:${s.strategy === 'rent' ? 'stream' : 'fund'}:${owned.address}`, 'Back to your Markee', 'text-button') : ''}${btn('create', 'Create your own Markee', 'text-button')}${s.strategy === 'rent' && this.account ? btn(`claim-refund:${entry.address}`, 'Collect refund', 'text-button') : ''}</div><div class="message-stats">${s.strategy === 'rent' ? `<span class="meta">${!this.account ? 'Live message ranking' : backing ? top ? '● Active stream' : w?.poolConnected ? '● Stream refunded while not the winner' : '● Connect your refund pool in Deposit manager' : 'No active stream from your wallet to this message'}</span><div class="stats-grid"><div><span class="stat-label">Ranking rate</span><strong>${formatEth((BigInt(entry.score) * MONTH).toString())} ETH/mo</strong></div>${this.account ? `<div><span class="stat-label">Your rate</span><strong>${formatEth((backing ? BigInt(w!.flowRate) * MONTH : 0n).toString())} ETH/mo</strong></div>` : ''}${w ? `<div><span class="stat-label">ETHx balance</span><strong>${formatEth(w.ethx)} ETHx</strong></div><div><span class="stat-label">Funds remaining</span><strong title="Across all of your ETHx flows">${w.runwaySeconds === null ? 'No net outflow' : `${(Number(w.runwaySeconds) / 86400).toFixed(1)} days`}</strong></div>` : ''}</div>${BigInt(entry.legacyFloor) > 0n ? `<p class="meta">Ranking includes a decaying legacy floor of ${formatEth((BigInt(entry.legacyFloor) * MONTH).toString())} ETH/mo.</p>` : ''}` : `<div class="stats-grid"><div><span class="stat-label">Total funded</span><strong>${formatEth(entry.totalFunds)} ETH</strong></div><div><span class="stat-label">Views</span><strong>${entry.views === null ? 'Unavailable' : entry.views.toLocaleString()}</strong></div></div>`}</div></section>`;
  }
  private fundingHtml(entry?: Entry) {
    const s = this.snapshot!, w = s.wallet, rent = s.strategy === 'rent';
    const presets = fundingPresets(s, entry);
    const backing = !!entry && entry.address.toLowerCase() === w?.backedMarkee?.toLowerCase();
    const current = rent && backing ? BigInt(w!.flowRate) * MONTH : 0n;
    const defaultAmount = BigInt(s.minimum) > presets.minimum ? BigInt(s.minimum) : presets.minimum;
    const initial = current > defaultAmount ? current : defaultAmount;
    const minimum = !rent && entry ? 1n : BigInt(s.minimum);
    return `<section class="funding-card"><label for="amount">${rent ? 'Monthly streaming rate' : 'Payment amount'}</label><div class="amount-row"><div class="amount-value"><input id="amount" name="amount" inputmode="decimal" value="${e(exact(initial.toString()))}" required aria-describedby="amount-hint"><span class="mono">${rent ? 'ETHx/mo' : 'ETH'}</span></div><div class="amount-presets">${btn('preset:min', 'MIN', 'compact mono', 'title="Use the minimum amount"')}${btn('preset:boost', presets.double ? '2×' : 'WIN', 'compact mono', 'title="Suggest an amount using the loaded ranking"')}</div></div><div class="funding-caption"><span id="amount-hint">Minimum ${exact(minimum.toString())} ${rent ? 'ETH/mo' : 'ETH'}</span>${this.account && w ? `<span>Balance ${formatEth(w.eth)} ETH</span>` : ''}</div><div class="funding-tools">${this.account ? btn('tab:wallet', rent ? 'Deposit manager →' : 'Wallet & rewards →', 'text-button') : ''}<span class="meta">${rent ? w?.runwaySeconds != null ? `${(Number(w.runwaySeconds) / 86400).toFixed(1)} days remaining` : w ? `${formatEth(w.ethx)} ETHx available` : 'ETH funds your ETHx balance' : 'One-time payment'}</span></div></section><p class="meta funding-hint">${rent ? 'Unspent rent is refunded while your message is not the winner. You can stop streaming at any time.' : entry ? 'Adding funds keeps the current message owner.' : 'The paying wallet will own this message.'} Shortcuts use the loaded ranking; positions can change.</p>`;
  }
  private formHtml() {
    const s = this.snapshot!, form = this.form;
    if (form?.kind.startsWith('edit')) return `<form id="markee-action" data-form="entry"><section class="message-card"><div class="eyebrow">Your Markee</div>${form.kind === 'edit-message' ? this.field('message', 'Markee message', form.entry.message, `${s.maxMessageBytes} UTF-8 bytes maximum.`, true) : this.field('name', 'Your name (optional)', form.entry.name, `${s.maxNameBytes} UTF-8 bytes maximum.`)}</section></form>`;
    return `<form id="markee-action" data-form="${form ? 'entry' : 'create'}">${form ? this.selectedMessageHtml(form.entry) : `<section class="message-card editor-card">${this.field('message', 'Markee message', '', `${s.maxMessageBytes} UTF-8 bytes maximum.`, true)}${this.field('name', 'Your name (optional)', '', `${s.maxNameBytes} UTF-8 bytes maximum.`)}</section>`}${this.fundingHtml(form?.entry)}${!form && s.strategy === 'rent' ? '<p class="note">First create your message, then review and confirm its stream. Your chosen rate is kept for the next step.</p>' : ''}</form>`;
  }
  private updateFields() {
    for (const field of this.root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-byte-limit]')) {
      const limit = Number(field.dataset.byteLimit);
      const bytes = new TextEncoder().encode(field.value).length;
      field.setCustomValidity(bytes > limit ? `Use at most ${limit} UTF-8 bytes.` : '');
      const count = this.root.querySelector(`[data-count-for="${field.name}"]`);
      if (count) count.textContent = `${bytes}/${limit}`;
    }
    const amount = this.root.querySelector<HTMLInputElement>('#markee-action #amount');
    if (amount && this.snapshot) {
      const presets = fundingPresets(this.snapshot, this.form?.entry);
      let value: bigint | undefined;
      try { value = BigInt(parseEth(amount.value, this.snapshot.strategy === 'sale')); } catch { /* Keep draft text while typing. */ }
      const minimum = this.snapshot.strategy === 'sale' && this.form ? 1n : BigInt(this.snapshot.minimum);
      amount.setCustomValidity(value === undefined ? 'Enter a valid ETH amount.' : value < minimum ? `Use at least ${exact(minimum.toString())} ETH${this.snapshot.strategy === 'rent' ? ' per month' : ''}.` : '');
      this.root.querySelector('[data-cmd="preset:min"]')?.setAttribute('aria-pressed', String(value === presets.minimum));
      this.root.querySelector('[data-cmd="preset:boost"]')?.setAttribute('aria-pressed', String(value === presets.boost));
    }
  }
  private walletHtml() {
    const s = this.snapshot!, w = s.wallet;
    if (!w) return '<p class="empty">Connect your wallet to see balances and manage your Markee.</p>' + btn('connect', 'Connect app wallet', 'primary full');
    let html = `<h2>Your wallet</h2><p class="meta mono">${e(w.address)}</p><div class="grid"><div class="card"><span class="meta">Native ETH</span><div class="metric">${formatEth(w.eth)}</div></div><div class="card"><span class="meta">MARKEE</span><div class="metric">${w.markee === null ? 'Unavailable' : formatEth(w.markee, 2)}</div></div></div>`;
    if (s.strategy === 'sale') return html + '<p class="note">Payments reward the paying wallet when this board has RevNet enabled. Manage your messages from the leaderboard.</p>';
    html += `<div class="divider"></div><div class="card"><div class="stat"><span>Available ETHx</span><strong>${formatEth(w.ethx)} ETHx</strong></div><div class="stat"><span>This board’s monthly rate</span><strong>${formatEth((BigInt(w.flowRate) * 2628000n).toString())} ETH</strong></div><div class="stat"><span>Refund flow / month</span><strong>${formatEth((BigInt(w.refundRate) * 2628000n).toString())} ETHx</strong></div><div class="stat"><span>Runway across all ETHx flows</span><strong>${w.runwaySeconds === null ? 'No net outflow' : `${(Number(w.runwaySeconds) / 86400).toFixed(1)} days`}</strong></div><p class="meta">Snapshot at ${new Date(w.observedAt * 1000).toLocaleTimeString()}. Balances and rates can change.</p><div class="row">${BigInt(w.flowRate) > 0n ? btn('stop', 'Stop stream', 'danger') : ''}${w.backedMarkee && !w.poolConnected ? btn(`connect-refund:${w.backedMarkee}`, 'Connect refund pool', 'accent') : ''}${btn('refresh', 'Refresh balances')}</div></div><div class="divider"></div><h3>Manage ETHx</h3><form data-form="balance"><div class="grid"><div><label for="kind">Action</label><select id="kind" name="kind"><option value="wrap">Deposit ETH → ETHx</option><option value="unwrap">Withdraw ETHx → ETH</option></select></div>${this.field('amount', 'Amount', '0.001')}</div><button type="submit" class="btn">Review balance change</button></form><div class="divider"></div><div class="card"><h3>Buffer and rewards</h3><div class="stat"><span>Refundable board buffer</span><strong>${formatEth(w.withdrawableDeposit)} ETHx</strong></div><div class="stat"><span>Accrued rent to settle</span><strong>${formatEth(w.pendingSettlement)} ETH</strong></div><p class="meta">Rewards come from actual rent spent, not the ETH deposited into your wallet.</p><div class="row">${BigInt(w.withdrawableDeposit) > 0n ? btn('withdraw-buffer', 'Recover buffer') : ''}${BigInt(w.pendingSettlement) > 0n ? btn('settle', s.revnetEnabled ? 'Claim MARKEE' : 'Settle rent', 'primary') : ''}${w.backedMarkee && BigInt(w.poolClaimable) > 0n ? btn(`claim-refund:${w.backedMarkee}`, 'Collect pool refund') : ''}</div></div>`;
    return html;
  }
  private communityHtml() {
    const c = this.snapshot!.community;
    if (!c) return '';
    return `<h2>Community treasury</h2><p class="muted">Community council members can activate Markee and collect community revenue.</p><div class="card"><div class="stat"><span>Integration</span><strong>${c.integration.status === 'active' ? 'Active' : 'Not activated'}</strong></div><div class="stat"><span>Available revenue</span><strong>${formatEth(c.revenue.claimableAmount)} ETH</strong></div>${c.permissions?.councilSafe ? `<p class="meta">Council treasury<br><span class="mono">${e(c.permissions.councilSafe)}</span></p>` : ''}<div class="row">${this.adminProcessing ? '<p class="note">A signed community action is processing. Check it before authorizing another.</p>' + btn('admin-check', 'Check community action', 'primary') : !this.account ? btn('connect', 'Connect council wallet', 'primary') : c.integration.status !== 'active' && c.permissions?.canActivate ? btn('activate', 'Activate community Markee', 'primary') : c.permissions?.canClaim && BigInt(c.revenue.claimableAmount) > 0n ? btn('claim', 'Review revenue claim', 'primary') : '<span class="meta">No authorized action is currently available for this wallet.</span>'}</div></div>${this.adminResult ? `<div class="success">Source transaction confirmed. ${link(this.adminResult.transactionUrl || '', 'View transaction')}${this.adminResult.bridged ? '<p>Bridge delivery is tracked separately from the source transaction.</p>' : ''}${btn('bridge', 'Check transfer status')}</div>` : ''}`;
  }
  private title() {
    const s = this.snapshot;
    if (this.wallets) return 'Connect your wallet';
    if (this.review) return 'Review payment';
    if (this.authorization) return 'Review authorization';
    if (this.pending) return 'Payment in progress';
    if (this.tab === 'wallet') return s?.strategy === 'rent' ? 'Deposit manager' : 'Wallet & rewards';
    if (this.tab === 'community' || s && !s.board) return 'Community treasury';
    if (this.form?.kind.startsWith('edit')) return 'Edit your Markee';
    if (!this.form) return 'Change the Markee Sign';
    if (this.form.entry.owner.toLowerCase() !== this.account?.toLowerCase()) return 'Fund a Markee';
    return s?.strategy === 'sale' ? 'Fund your Markee' : BigInt(s?.wallet?.flowRate ?? '0') > 0n ? 'Manage your Markee stream' : 'Stream to your Markee';
  }
  private hostedEligible() {
    const s = this.snapshot;
    return !!s && s.strategy === 'sale' && s.chainId === 8453 && s.placement.kind === 'board' && s.revnetEnabled && !!s.token;
  }
  private footerHtml() {
    const s = this.snapshot;
    let actions = '';
    if (this.wallets) actions = btn('back', 'Back');
    else if (this.review) actions = btn('back', 'Back') + btn('send', 'Confirm in wallet', 'primary');
    else if (this.authorization) actions = btn('back', 'Back') + btn('sign', 'Sign authorization', 'primary');
    else if (this.pending) actions = btn('check', 'Check transaction', 'primary');
    else if (s && this.tab === 'main' && s.board) {
      const editing = this.form?.kind.startsWith('edit');
      const secondary = editing ? btn('back', 'Cancel') : s.strategy === 'rent' && BigInt(s.wallet?.flowRate ?? '0') > 0n ? btn('stop', 'Stop streaming', 'danger') : '';
      if (!this.account) actions = btn('card', 'Pay', 'primary', !this.checkoutChecked || !this.cardAvailable || !this.hostedEligible() ? 'disabled' : '');
      else actions = (this.cardAvailable && s.strategy === 'sale' && s.chainId === 8453 && s.placement.kind === 'board' && s.revnetEnabled && !!s.token && !editing ? btn('card', 'Pay by card', 'primary') : '') + secondary + (!this.account ? btn('connect', 'Connect wallet', 'primary') : `<button class="btn primary" type="submit" form="markee-action">${editing ? 'Review change' : !this.form && s.strategy === 'rent' ? 'Review creation' : 'Review payment info'}</button>`);
    } else if (s) actions = btn('tab:main', 'Back to Markee');
    return `<footer><div class="footer-actions">${actions}</div><div class="footer-meta"><span>Powered by Markee${this.account ? ` · ${shortAddress(this.account)}` : ''}</span>${this.account && s?.community && s.board && this.tab !== 'community' && !this.review && !this.authorization && !this.pending ? btn('tab:community', 'Community treasury', 'text-button') : ''}</div></footer>`;
  }
  private render() {
    if (this.closed) return;
    const active = this.root.activeElement as HTMLElement | null;
    const focusCommand = active?.dataset.cmd;
    const focusId = active?.id;
    const viewKey = this.wallets ? 'wallets' : this.review ? `review:${this.review.id}` : this.authorization ? `authorization:${this.authorization.value.nonce}` : this.pending ? `pending:${this.pending.hash}` : `${this.tab}:${this.form?.kind ?? 'create'}:${this.form?.entry.address ?? ''}`;
    const scrollTop = viewKey === this.renderedView ? this.root.querySelector('.content')?.scrollTop ?? 0 : 0;
    this.renderedView = viewKey;
    const shouldFocus = !document.activeElement || document.activeElement === document.body || document.activeElement === this.host;
    const s = this.snapshot;
    let body = '';
    if (this.wallets) body = `<h2>Choose your wallet</h2><div class="wallets">${this.wallets.map((w, i) => btn(`wallet:${i}`, e(w.name))).join('')}</div>`;
    else if (this.review) body = this.reviewHtml();
    else if (this.authorization) body = this.authorizationHtml();
    else if (!s) body = this.error ? btn('refresh', 'Retry', 'primary') : '<div class="loading"><span class="spinner"></span>Loading Markee…</div>';
    else if (this.pending) body = `<h2>Waiting for confirmation</h2><p>Your transaction was sent. You can close this modal and come back to check it.</p><p class="meta mono">${e(this.pending.hash)}</p><p class="note">Do not send a second payment while this transaction is pending.</p>`;
    else if (!s.board || this.tab === 'community') body = this.communityHtml();
    else if (this.tab === 'wallet') body = this.walletHtml();
    else body = `${this.form?.kind.startsWith('edit') ? '' : this.entriesHtml()}${this.formHtml()}${!this.account ? `<p class="note">${!this.checkoutChecked ? 'Checking Markee checkout availability…' : !this.hostedEligible() ? 'Pay in Markee is not supported for this board yet.' : !this.cardAvailable ? 'Pay in Markee is temporarily unavailable. Please try again later.' : 'Sign in and pay on Markee. Your payment wallet and rewards are managed there.'}</p>` : ''}`;
    const result = this.result ? `<div class="${this.result.status === 'reverted' || this.result.settlement === 'deferred' ? 'error' : 'success'}">${this.result.status === 'reverted' ? 'Transaction reverted. No action was completed.' : this.result.settlement === 'deferred' ? 'The transaction confirmed, but reward settlement was deferred. Your claim remains available.' : `Transaction confirmed.${this.result.tokensReceived && BigInt(this.result.tokensReceived) > 0n ? ` ${formatEth(this.result.tokensReceived, 2)} MARKEE delivered to your wallet.` : ''}`} ${link(this.result.explorerUrl, 'View receipt')}</div>` : '';
    this.root.innerHTML = `<style>${styles}</style><div class="overlay"><section class="panel" role="dialog" aria-modal="true" aria-labelledby="markee-title"><header><div class="grow"><h1 id="markee-title">${e(this.title())}</h1><p class="header-caption">${e(s?.name || 'Markee')}${s ? ` · ${s.strategy === 'rent' ? 'For rent' : 'For sale'}${s.chainId === 8453 ? ' · Base' : s.chainId === 11155111 ? ' · Sepolia testnet' : ''}` : ''}</p></div><button class="close" data-cmd="close" aria-label="Close Markee">×</button></header><main class="content" aria-busy="${this.busy}"><div role="status" aria-live="polite">${this.busy ? '<p class="meta"><span class="spinner"></span>Working…</p>' : ''}${this.error ? `<div class="error">${e(this.error)}</div>` : ''}${result}</div>${s?.warnings.map(w => `<div class="note">${e(w)}</div>`).join('') || ''}${body}</main>${this.footerHtml()}</section></div>`;
    if (this.busy) this.root.querySelectorAll<HTMLButtonElement>('button:not([data-cmd="close"])').forEach(b => { b.disabled = true; });
    const draft = this.drafts.get(this.draftKey());
    if (draft) for (const field of this.root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')) {
      if (draft[field.name] !== undefined) field.value = draft[field.name];
    }
    this.updateFields();
    const content = this.root.querySelector('.content');
    if (content) content.scrollTop = scrollTop;
    this.viewObserver?.disconnect();
    const winner = this.root.querySelector('.winner');
    const top = s?.entries.find(entry => entry.address.toLowerCase() === s.top?.toLowerCase());
    const impressionKey = top ? `${top.address}:${top.message}` : '';
    if (winner && top?.moderated === false && !this.viewed.has(impressionKey) && typeof IntersectionObserver !== 'undefined') {
      this.viewObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          this.viewObserver?.disconnect(); this.viewed.add(impressionKey);
          void this.client.recordView(top.address, top.message, window.location.origin).catch(() => { this.viewed.delete(impressionKey); });
        }
      }, { threshold: 0.5 });
      this.viewObserver.observe(winner);
    }
    if (shouldFocus) {
      const target = focusId ? this.root.getElementById(focusId) : focusCommand ? [...this.root.querySelectorAll<HTMLElement>('[data-cmd]')].find(node => node.dataset.cmd === focusCommand) : null;
      (target ?? this.root.querySelector<HTMLElement>('[data-cmd="close"]'))?.focus({ preventScroll: true });
    }
  }

}

export function createMarkee(options: SDKOptions = {}) {
  const client = new MarkeeClient(options);
  let modal: MarkeeModal | undefined;
  let theme = options.theme;
  return {
    client,
    open(options: ModalOptions) { modal?.close(); modal = new MarkeeModal(client, { ...options, theme: options.theme ?? theme }); return modal; },
    setTheme(next?: MarkeeTheme) { theme = next ?? {}; modal?.setTheme(theme); },
    close() { modal?.close(); modal = undefined; },
  };
}
