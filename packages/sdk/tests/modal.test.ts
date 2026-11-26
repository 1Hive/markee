import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkeeModal, boardMessageCount } from '../src/modal';

test('cancelling the wallet request preserves the review and enables retry', async () => {
  const modal = Object.create(MarkeeModal.prototype);
  const review = { id: 'existing-review' };
  Object.assign(modal, { busy: false, review, render() {} });
  await modal.task(async () => { throw { code: 4001 }; });
  assert.match(modal.error, /^Wallet request cancelled\./);
  assert.equal(modal.review, review);
  assert.equal(modal.pending, undefined);
  assert.equal(modal.busy, false);
});

const address = '0x1111111111111111111111111111111111111111';
function view(account: string | null, available = true) {
  const modal = Object.create(MarkeeModal.prototype);
  Object.assign(modal, { account, tab: 'main', cardAvailable: available, checkoutChecked: true,
    snapshot: { beneficiary: '0x2222222222222222222222222222222222222222', board: address, placement: { kind: 'board', chainId: 8453, address }, chainId: 8453,
      strategy: 'sale', revnetEnabled: true, token: address, minimum: '1000000000000000', entries: [], wallet: account ? { eth: '1000000000000000000' } : null } });
  return modal as { footerHtml(): string; fundingHtml(): string };
}
test('moderation notices use distinct styling while approved messages keep the normal message style', () => {
  const modal = view(null) as { entryMessageHtml(entry: { message: string; moderated: boolean | null }): string };
  const flagged = modal.entryMessageHtml({ message: 'Private text', moderated: true });
  assert.match(flagged, /class="message moderation-placeholder">This message is hidden by moderation\./);
  assert.doesNotMatch(flagged, /Private text/);
  const loading = modal.entryMessageHtml({ message: 'Private text', moderated: null });
  assert.match(loading, /class="message moderation-placeholder" role="status">Message unavailable\. Moderation could not be checked\./);
  assert.doesNotMatch(loading, /Private text|This is a sign/);
  assert.match(modal.entryMessageHtml({ message: '<Public text>', moderated: false }), /class="message">&lt;Public text&gt;<\/p>/);
});
test('wallet-free checkout has a single Review Payment action and no connected-wallet controls', () => {
  const modal = view(null);
  const footer = modal.footerHtml();
  assert.equal((footer.match(/<button/g) || []).length, 1);
  assert.match(footer, /data-cmd="card" >Review Payment<\/button>/);
  assert.doesNotMatch(footer, /Connect wallet|connect-review|Pay by card/);
  assert.doesNotMatch(modal.fundingHtml(), /Balance|Connect to see|Wallet &amp; rewards|Wallet & rewards|tab:wallet/);
});
test('unavailable hosted checkout keeps its button disabled instead of offering a wallet connection', () => {
  assert.match(view(null, false).footerHtml(), /data-cmd="card" disabled>Review Payment/);
  assert.doesNotMatch(view(null, false).footerHtml(), /data-cmd="connect/);
});
test('connected app wallet retains its balance and payment review', () => {
  assert.match(view(address).fundingHtml(), /Balance 1 ETH/);
  assert.match(view(address).fundingHtml(), /tab:wallet/);
  assert.match(view(address).footerHtml(), />Review Payment<\/button>/);
});

test('community admin view links to the matching Markee creator dashboard', () => {
  for (const [chainId, origin] of [[8453, 'www'], [11155111, '2staging']] as const) {
    for (const kind of ['gardens-community', 'platform-community'] as const) {
      const modal = Object.create(MarkeeModal.prototype) as { communityHtml(): string };
      Object.assign(modal, {
        options: { placement: { kind, chainId } }, client: { options: {} }, account: null, adminProcessing: false,
        snapshot: { chainId, board: null, community: {
          integration: { status: 'not_integrated' }, revenue: { claimableAmount: '0' },
          permissions: { canActivate: false },
        } },
      });
      const html = modal.communityHtml();
      assert.ok(html.includes(`href="https://${origin}.markee.xyz/account?section=creator"`));
      assert.match(html, /Manage on Markee ↗/);
      assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    }
  }
});

test('platform activation asks for an explicit Base beneficiary and explains the selected payment model', () => {
  const modal = Object.create(MarkeeModal.prototype) as { communityHtml(): string; activationHtml(): string; authorizationHtml(): string; selectedStrategy: string; authorization: unknown; baseBeneficiary: string };
  Object.assign(modal, {
    options: { placement: { kind: 'platform-community', platformId: 'revnet', chainId: 8453 } },
    client: { options: {} }, account: address, adminProcessing: false, baseBeneficiary: '',
    snapshot: { chainId: 8453, board: null, community: {
      integration: { status: 'not_integrated' }, revenue: { claimableAmount: '0' }, permissions: { canActivate: true },
    } },
  });
  modal.selectedStrategy = 'sale';
  assert.match(modal.communityHtml(), /Set up community Markee/);
  assert.doesNotMatch(modal.communityHtml(), /id="base-beneficiary"/);
  assert.match(modal.activationHtml(), /Beneficiary wallet or contract address on Base/);
  assert.match(modal.activationHtml(), /Payments transfer native ETH on Base/);
  assert.match(modal.activationHtml(), /id="base-beneficiary"[^>]*value=""/);
  assert.match(modal.activationHtml(), /data-cmd="activate" disabled/);
  modal.baseBeneficiary = `0x${'0'.repeat(40)}`;
  assert.match(modal.activationHtml(), /data-cmd="activate" disabled/);
  modal.baseBeneficiary = address;
  assert.doesNotMatch(modal.activationHtml(), /data-cmd="activate" disabled/);
  modal.selectedStrategy = 'rent';
  assert.match(modal.activationHtml(), /Payments stream ETHx on Base/);
  for (const [strategy, payment] of [[1, 'native ETH'], [2, 'ETHx']] as const) {
    modal.authorization = { kind: 'platform-activate', value: { typedData: { message: { strategy, beneficiary: address } } } };
    const html = modal.authorizationHtml();
    assert.match(html, /Base beneficiary/);
    assert.match(html, new RegExp(`For (Sale|Rent) (transfers|streams) ${payment} on Base`));
  }
});

test('submitted platform activation returns to community status instead of offering another review', async () => {
  const modal = Object.create(MarkeeModal.prototype) as { applyAdmin(op: { status: 'working' }): Promise<void>; tab: string; adminProcessing: boolean; authorization: unknown };
  Object.assign(modal, { options: { placement: { kind: 'platform-community' } }, tab: 'activation', authorization: { kind: 'platform-activate' } });
  await modal.applyAdmin({ status: 'working' });
  assert.equal(modal.tab, 'community');
  assert.equal(modal.adminProcessing, true);
  assert.equal(modal.authorization, undefined);
});

function rentView(account: string | null) {
  const modal = view(account) as unknown as { snapshot: Record<string, unknown>; footerHtml(): string; fundingHtml(): string; reviewHtml(): string; review: unknown };
  // The minimum from the screenshot: 0.000999999997884 ETH/mo (a per-second rate times a month).
  Object.assign(modal.snapshot, { strategy: 'rent', minimum: '999999997884000', wallet: account ? { eth: '1000000000000000000', ethx: '0', flowRate: '0', runwaySeconds: null } : null });
  return modal;
}
test('For Rent without a wallet connects one from Review Payment instead of a disabled Pay', () => {
  const footer = rentView(null).footerHtml();
  assert.match(footer, /data-cmd="connect-review"[^>]*>Review Payment<\/button>/);
  assert.doesNotMatch(footer, /disabled|data-cmd="card"/);
  assert.match(footer, /Powered by Markee · <a href="https:\/\/www\.markee\.xyz\/markee\/0x1111111111111111111111111111111111111111"[^>]*>View in App ↗<\/a>/);
});
test('the For Rent funding card rounds the minimum and shows the app’s ETHx details', () => {
  const html = rentView(null).fundingHtml();
  assert.match(html, /Minimum 0\.001 ETH\/mo/);
  assert.doesNotMatch(html, /0\.000999999997884|ETH funds your ETHx balance|Unspent rent|Shortcuts use/);
  assert.match(html, /Paid in ETHx<button type="button" class="info-tip"[^>]*data-tip="Markee uses Superfluid for payment streaming\./);
  assert.match(html, /name="amount"[^>]*value="0\.001"/);
  const connected = rentView(address).fundingHtml();
  assert.match(connected, /ETH Balance 1/);
  assert.match(connected, /Deposit manager →/);
  assert.match(connected, /aria-label="MIN: Minimum bid amount/);
  assert.match(connected, /aria-label="WIN: Amount needed to take the top spot/);
});
test('a new rental bid starts at the rounded WIN amount while a winning backer retains their bid', () => {
  const modal = rentView(address) as { snapshot: Record<string, any>; form: unknown; fundingHtml(entry?: unknown): string };
  const leader = { address, owner: address, score: '1', aggregateRate: '1', totalFunds: '0' };
  modal.snapshot.entries = [leader]; modal.snapshot.top = address;
  assert.match(modal.fundingHtml(), /name="amount"[^>]*value="0\.002"/);
  modal.snapshot.wallet = { eth: '1000000000000000000', ethx: '0', backedMarkee: address, flowRate: '380517504', runwaySeconds: null };
  assert.match(modal.fundingHtml(leader), /name="amount"[^>]*value="0\.001"/);
});
test('the For Rent explanation appears on the payment review', () => {
  const modal = rentView(address);
  modal.review = {
    action: { kind: 'stream', markee: address, monthlyAmount: '2000000000000000' },
    transaction: { from: address, to: address, chainId: 8453, value: '0x0' },
    review: { title: 'Start your rental stream', lines: [], estimatedGasCost: '1', reward: '' },
  };
  assert.match(modal.reviewHtml(), /Unspent rent is refunded while your message is not the winner\. You can stop streaming at any time\./);
});

test('payment review follows the compact Gardens summary without hiding transaction facts', () => {
  const modal = view(address) as { review: unknown; form: unknown; reviewHtml(): string; footerHtml(): string };
  modal.form = { kind: 'fund', entry: { address, message: '<Fund this message>', moderated: false } };
  modal.review = {
    action: { kind: 'fund', markee: address, amount: '2000000000000000' },
    transaction: { from: address, to: address, chainId: 8453, value: '0x71afd498d0000' },
    review: { title: 'Fund this Markee', lines: ['Funding keeps the current message owner.', 'Native ETH sent: 0.002 ETH', 'Network: Base', `Recipient: ${address}`], estimatedGasCost: '11000000000000', estimatedTokens: '65740030623460125633', reward: 'MARKEE reaches your wallet.' },
  };
  const html = modal.reviewHtml();
  assert.match(html, /class="review-message"/);
  assert.match(html, /&lt;Fund this message&gt;/);
  assert.match(html, /<span>Paying<\/span><strong>0\.002 ETH<\/strong>/);
  assert.match(html, /<span>Estimated network fee<\/span>/);
  assert.match(html, /<span>You&#39;ll earn<\/span>/);
  assert.match(html, /65\.74 MARKEE \(estimated\)/);
  assert.match(html, /<details class="review-details"><summary>Transaction details<\/summary>/);
  assert.doesNotMatch(html, /Community split beneficiary/);
  assert.match(html, /Leaderboard contract/);
  assert.doesNotMatch(html, /Connected wallet/);
  assert.doesNotMatch(html, /copy-recipient|copy-wallet/);
  assert.doesNotMatch(html, /<ul>|<li>/);
  assert.match(modal.footerHtml(), />Confirm payment<\/button>/);
});

test('rental payment review shows monthly rate and immediate ETH deposit', () => {
  const modal = view(address) as { review: unknown; snapshot: { strategy: string; revnetEnabled: boolean }; reviewHtml(): string };
  modal.snapshot.strategy = 'rent';
  modal.review = {
    action: { kind: 'stream', markee: address, monthlyAmount: '2000000000000000' },
    transaction: { from: address, to: address, chainId: 8453, value: '0x38d7ea4c68000' },
    review: { estimatedTokens: '16430000000000000000', title: 'Start your rental stream', lines: ['Wrap 0.001 ETH into ETHx.'], estimatedGasCost: '11000000000000', reward: 'MARKEE is earned from rent actually spent.', streamDetails: { effectiveMonthlyWei: '2000000000001000', bufferTopUpWei: '10958904109' } },
  };
  const html = modal.reviewHtml();
  assert.match(html, /<span>Paying<\/span><strong>0\.002 ETHx\/mo<\/strong>/);
  assert.match(html, /<span>Depositing now<\/span><strong>0\.001 ETH<\/strong>/);
  assert.match(html, /Your bid streams until you stop it/);
  assert.doesNotMatch(html.split('<summary>Transaction details</summary>')[0], /Wrap 0\.001 ETH into ETHx/);
  const details = html.split('<summary>Transaction details</summary>')[1].split('</details>')[0];
  assert.equal((details.match(/class="review-row"/g) || []).length, 4);
  assert.match(details, /Wrap 0\.001 ETH into ETHx/);
  assert.match(details, /Precise stream rate/);
  assert.match(details, /0\.002000000000001 ETHx\/mo/);
  assert.match(details, /Refundable buffer added/);
  assert.match(html, /<span>Estimated network fee<\/span>/);
  assert.match(html, /16\.43 MARKEE\/month \(estimated\)/);
});

test('message edits show only their own action and transaction facts', () => {
  const modal = rentView(address);
  modal.review = { action: { kind: 'edit-message', markee: address, message: '<New public message>' },
    transaction: { from: address, to: address, chainId: 8453, value: '0x0' },
    review: { title: 'Update your message', lines: [], estimatedGasCost: '1', reward: '' } };
  const html = modal.reviewHtml();
  assert.match(html, /aria-label="New Message"/);
  assert.match(html, /&lt;New public message&gt;/);
  assert.match(html, /This update changes the message everyone sees once confirmed/);
  assert.doesNotMatch(html, /Native ETH sent|Connected wallet|Unspent rent|review-callout|Community split beneficiary/);
  assert.match(html, /Leaderboard contract/);
});

test('payment routing appears only when the API supplies verified split data', () => {
  const modal = view(address) as { review: unknown; reviewHtml(): string };
  modal.review = { action: { kind: 'fund', markee: address, amount: '2000000000000000' },
    transaction: { from: address, to: address, chainId: 8453, value: '0x71afd498d0000' },
    review: { title: 'Fund', lines: [], estimatedGasCost: '1', reward: '',
      paymentRouting: { beneficiary: '0x2222222222222222222222222222222222222222', beneficiaryBps: 6200,
        revnetTerminal: '0x3333333333333333333333333333333333333333', revnetBps: 3800 } } };
  const html = modal.reviewHtml();
  assert.match(html, /Markee beneficiary · 62% of payment/);
  assert.match(html, /RevNet terminal · 38% of payment/);
  assert.match(html, /basescan.org\/address\/0x3333333333333333333333333333333333333333/);
});

test('a second edit is offered for explicit review only after the first transaction confirms', async () => {
  for (const status of ['confirmed', 'reverted'] as const) {
    const modal = Object.create(MarkeeModal.prototype) as { poll(): Promise<void>; pending: unknown; queuedNameEdit: unknown; result: unknown };
    const prepared: unknown[] = [];
    Object.assign(modal, { closed: false, account: address,
      pending: { hash: '0x123', preparation: { action: { kind: 'edit-message', markee: address } } },
      queuedNameEdit: { markee: address, account: address, name: 'Paul', afterHash: '0x123' },
      client: { verifyOperation: async () => ({ status, hash: '0x123' }) },
      reload: async () => {}, prepare: async (action: unknown) => { prepared.push(action); }, render: () => {} });
    await modal.poll();
    assert.equal(modal.pending, undefined);
    assert.deepEqual(prepared, status === 'confirmed' ? [{ kind: 'edit-name', markee: address, name: 'Paul' }] : []);
  }
});

test('a reverted recovery hash shows an error while keeping the unresolved wallet batch', async () => {
  const modal = Object.create(MarkeeModal.prototype) as { poll(): Promise<void>; pending: unknown; error: string; timer: unknown };
  const pending = { version: 2, phase: 'receipt-submitted', mode: 'batch', hash: '0x123', preparation: { action: { kind: 'fund' } } };
  let rendered = false;
  Object.assign(modal, { closed: false, pending, error: '',
    client: { verifyOperation: async () => ({ status: 'reverted', hash: '0x123' }) },
    render: () => { rendered = true; } });
  await modal.poll();
  assert.equal(modal.pending, pending);
  assert.match(modal.error, /reverted.*still unresolved/);
  assert.equal(modal.timer, undefined);
  assert.equal(rendered, true);
});

test('the combined editor and deposit manager show distinct editable fields and claims', () => {
  const modal = rentView(address) as { snapshot: Record<string, any>; form: unknown; formHtml(): string; walletHtml(): string; balanceMode: string };
  const entry = { address, owner: address, message: 'Old message', name: 'Old name' };
  modal.form = { kind: 'edit', entry };
  const editor = modal.formHtml();
  assert.match(editor, /Your Message/);
  assert.match(editor, /Display Name \(optional\)/);
  assert.match(editor, /Show people who wrote this/);
  modal.snapshot.wallet = { eth: '1000000000000000000', ethx: '3000000000000000', markee: null,
    flowRate: '1', backedMarkee: address, poolConnected: true, poolClaimable: '1000000000000000',
    pendingSettlement: '2000000000000000', withdrawableDeposit: '3000000000000000',
    runwaySeconds: '86400', observedAt: 100 };
  modal.snapshot.top = address; modal.balanceMode = 'wrap';
  const wallet = modal.walletHtml();
  assert.match(wallet, /Native ETH/);
  assert.match(wallet, /Deposited ETH \(ETHx\)/);
  assert.match(wallet, /bid-status streaming/);
  assert.match(wallet, /Runway across all wallet ETHx flows/);
  assert.match(wallet, /data-cmd="balance:wrap"/);
  assert.match(wallet, /data-cmd="balance:unwrap"/);
  assert.match(wallet, /data-cmd="balance-percent:100"/);
  assert.match(wallet, /data-cmd="settle"/);
  assert.match(wallet, /data-cmd="claim-refund:/);
  assert.match(wallet, /data-cmd="withdraw-buffer"/);
  modal.snapshot.top = '0x2222222222222222222222222222222222222222';
  assert.match(modal.walletHtml(), /bid-status not-winning/);
});


test('wallet polling does not invalidate a slow initial snapshot or repeat a wallet transition', async () => {
  let account: string | null = address;
  let changes = 0;
  const modal = Object.create(MarkeeModal.prototype);
  Object.assign(modal, { account: null, busy: false, closed: false,
    client: { provider: async () => null, account: async () => account },
    walletChanged: () => { changes++; },
  });
  const poll = async () => { await modal.watchAccount(); clearTimeout(modal.accountTimer); };
  await poll(); await poll(); await poll();
  assert.equal(changes, 0, 'initial connected wallet is not a change while snapshot is pending');
  account = '0x2222222222222222222222222222222222222222';
  await poll(); await poll();
  assert.equal(changes, 1, 'real switch refreshes once even before its snapshot resolves');
  modal.busy = true; account = null;
  await poll(); assert.equal(changes, 1);
  modal.busy = false;
  await poll(); await poll(); assert.equal(changes, 2, 'deferred disconnect still refreshes');
  account = address;
  await poll(); assert.equal(changes, 3, 'reconnection refreshes');
});


test('sale payment above wallet balance is rejected before API preparation', async () => {
  let requests = 0;
  const modal = Object.create(MarkeeModal.prototype);
  Object.assign(modal, { account: address, snapshot: { strategy: 'sale', wallet: { eth: '1688000000000000' } },
    options: { placement: { kind: 'board', chainId: 8453, address } },
    client: { prepare: async () => { requests++; return {}; } },
  });
  await assert.rejects(modal.prepare({ kind: 'fund', markee: address, amount: '498910000000000000' }), /Not enough ETH/);
  assert.equal(requests, 0);
  await modal.prepare({ kind: 'fund', markee: address, amount: '1000000000000000' });
  assert.equal(requests, 1, 'affordable payment still gets server-side gas validation');
});

test('wallet events preserve the reviewed payment while confirmation is pending', () => {
  const modal = Object.create(MarkeeModal.prototype);
  const review = { id: 'review-being-signed' };
  let reloads = 0;
  Object.assign(modal, {
    busy: true, closed: false, review,
    render: () => {}, reload: async () => { reloads++; },
  });
  modal.handleWalletChange();
  assert.equal(modal.review, review);
  assert.equal(reloads, 0);
  modal.busy = false;
  modal.handleWalletChange();
  assert.equal(modal.review, undefined);
  assert.equal(reloads, 1);
});
test('Review Payment explains when no wallet was connected, and continues to the review when one was', async () => {
  const make = (account: string | null, wallets?: unknown[]) => {
    const modal = Object.create(MarkeeModal.prototype);
    let submitted = 0;
    Object.assign(modal, { account: null, reviewAfterConnect: false,
      connect: async () => { modal.account = account; modal.wallets = wallets; },
      root: { querySelector: () => ({ requestSubmit: () => { submitted++; } }) } });
    return { modal: modal as { connectAndReview(): Promise<void>; reviewAfterConnect: boolean }, submitted: () => submitted };
  };
  const none = make(null);
  await assert.rejects(none.modal.connectAndReview(), /No wallet connected\. Connect a wallet to rent this sign\./);
  assert.equal(none.modal.reviewAfterConnect, false);
  const picker = make(null, [{ name: 'A' }, { name: 'B' }]);
  await picker.modal.connectAndReview();
  assert.equal(picker.modal.reviewAfterConnect, true, 'choosing a wallet in the picker continues to the review');
  const connected = make('0x1111111111111111111111111111111111111111');
  await connected.modal.connectAndReview();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(connected.submitted(), 1, 'continues to the review after connecting');
});
test('a rejected wallet prompt does not later open a review by itself', async () => {
  const modal = Object.create(MarkeeModal.prototype);
  Object.assign(modal, { account: null, reviewAfterConnect: false, connect: async () => { throw { code: 4001 }; } });
  await assert.rejects(modal.connectAndReview());
  assert.equal(modal.reviewAfterConnect, false);
});

test('the message count excludes the empty seed Markee and survives browsing later pages', () => {
  const entry = (message: string, moderated: boolean | null = false) => ({ message, name: '', moderated });
  // Whole board on the first page: count non-blank entries.
  assert.equal(boardMessageCount({ entries: [entry('gm'), entry('hi'), entry('')], nextOffset: null, count: 3 } as never), 2);
  // Moderation not loaded yet (text withheld): fall back to markeeCount minus the seed.
  assert.equal(boardMessageCount({ entries: [entry('', null), entry('', null), entry('', null)], nextOffset: null, count: 3 } as never), 2);
  // More pages: markeeCount minus the seed.
  assert.equal(boardMessageCount({ entries: [entry('gm')], nextOffset: 20, count: 45 } as never), 44);
});

test('submitting without a wallet uses Review Payment: hosted checkout, or connect then review on For Rent', () => {
  for (const [buttons, expected] of [[['connect-review'], 'connect-review'], [['card'], 'card']] as const) {
    const clicked: string[] = [];
    const modal = Object.create(MarkeeModal.prototype);
    Object.assign(modal, { root: { querySelector: (selector: string) => {
      const cmd = buttons.find(name => selector.includes(`[data-cmd="${name}"]`));
      return cmd ? { click: () => { clicked.push(cmd); } } : null;
    } } });
    (modal as { submitWithoutWallet(): void }).submitWithoutWallet();
    assert.deepEqual(clicked, [expected]);
  }
});

test('connecting from Review Payment keeps the form instead of opening the wallet\'s own Markee', async () => {
  const account = '0x1111111111111111111111111111111111111111';
  const own = { address: '0x2222222222222222222222222222222222222222', owner: account, message: 'mine', name: '', moderated: false };
  const snapshot = { strategy: 'rent', entries: [own], nextOffset: null, count: 2, wallet: null };
  for (const reviewAfterConnect of [false, true]) {
    const modal = Object.create(MarkeeModal.prototype);
    Object.assign(modal, {
      epoch: 0, closed: false, form: undefined, initialSelection: false, reviewAfterConnect,
      drafts: new Map(), abort: new AbortController(), options: { placement: { kind: 'leaderboard' } },
      render: () => {},
      client: { account: async () => account, snapshot: async () => snapshot, pending: () => undefined, pendingAuthorization: () => null },
    });
    await (modal as { reload(): Promise<void> }).reload();
    const form = (modal as { form?: { entry: unknown } }).form;
    if (reviewAfterConnect) assert.equal(form, undefined, 'the create form must stay for the review');
    else assert.equal(form?.entry, own, 'a plain connect opens the wallet\'s own Markee');
  }
});
