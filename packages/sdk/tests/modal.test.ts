import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkeeModal } from '../src/modal';

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
  assert.match(modal.entryMessageHtml({ message: 'Private text', moderated: null }), /class="message moderation-placeholder" role="status" aria-label="Loading message">This is a sign<span class="sign-dots"/);
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
  assert.match(html, /Paid in ETHx<span class="info-tip"[^>]*title="Markee uses Superfluid for payment streaming\./);
  const connected = rentView(address).fundingHtml();
  assert.match(connected, /ETH Balance 1/);
  assert.match(connected, /Deposit manager →/);
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
  assert.match(html, /Community split beneficiary/);
  assert.match(html, /Leaderboard contract/);
  assert.match(html, /Connected wallet/);
  assert.match(html, /href="https:\/\/basescan.org\/address\/0x2222222222222222222222222222222222222222"/);
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
    review: { estimatedTokens: '16430000000000000000', title: 'Start your rental stream', lines: ['Wrap 0.001 ETH into ETHx.'], estimatedGasCost: '11000000000000', reward: 'MARKEE is earned from rent actually spent.' },
  };
  const html = modal.reviewHtml();
  assert.match(html, /<span>Paying<\/span><strong>0\.002 ETHx\/mo<\/strong>/);
  assert.match(html, /<span>Depositing now<\/span><strong>0\.001 ETH<\/strong>/);
  assert.match(html, /Your payment only streams while your message is winning/);
  assert.doesNotMatch(html, /Wrap 0\.001 ETH into ETHx/);
  const details = html.split('<summary>Transaction details</summary>')[1].split('</details>')[0];
  assert.equal((details.match(/class="review-row"/g) || []).length, 4);
  assert.doesNotMatch(details, /<p>/);
  assert.match(html, /<span>Estimated network fee<\/span>/);
  assert.match(html, /16\.43 MARKEE\/month \(estimated\)/);
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
