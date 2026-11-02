import assert from 'node:assert/strict';
import test from 'node:test';
import { MarkeeModal } from '../src/modal';

const address = '0x1111111111111111111111111111111111111111';
function view(account: string | null, available = true) {
  const modal = Object.create(MarkeeModal.prototype);
  Object.assign(modal, { account, tab: 'main', cardAvailable: available, checkoutChecked: true,
    snapshot: { board: address, placement: { kind: 'board', chainId: 8453, address }, chainId: 8453,
      strategy: 'sale', revnetEnabled: true, token: address, minimum: '1000000000000000', entries: [], wallet: account ? { eth: '1000000000000000000' } : null } });
  return modal as { footerHtml(): string; fundingHtml(): string };
}
test('moderation notices use distinct styling while approved messages keep the normal message style', () => {
  const modal = view(null) as { entryMessageHtml(entry: { message: string; moderated: boolean | null }): string };
  const flagged = modal.entryMessageHtml({ message: 'Private text', moderated: true });
  assert.match(flagged, /class="message moderation-placeholder">This message is hidden by moderation\./);
  assert.doesNotMatch(flagged, /Private text/);
  assert.match(modal.entryMessageHtml({ message: 'Private text', moderated: null }), /class="message moderation-placeholder">Message unavailable while moderation loads\./);
  assert.match(modal.entryMessageHtml({ message: '<Public text>', moderated: false }), /class="message">&lt;Public text&gt;<\/p>/);
});
test('wallet-free checkout has a single Pay action and no connected-wallet controls', () => {
  const modal = view(null);
  const footer = modal.footerHtml();
  assert.equal((footer.match(/<button/g) || []).length, 1);
  assert.match(footer, />Pay<\/button>/);
  assert.doesNotMatch(footer, /Connect wallet|Review payment|Pay by card/);
  assert.doesNotMatch(modal.fundingHtml(), /Balance|Connect to see|Wallet &amp; rewards|Wallet & rewards|tab:wallet/);
});
test('unavailable hosted checkout keeps Pay disabled instead of offering a wallet connection', () => {
  assert.match(view(null, false).footerHtml(), /data-cmd="card" disabled>Pay/);
  assert.doesNotMatch(view(null, false).footerHtml(), /data-cmd="connect"/);
});
test('connected app wallet retains its balance and payment review', () => {
  assert.match(view(address).fundingHtml(), /Balance 1 ETH/);
  assert.match(view(address).fundingHtml(), /tab:wallet/);
  assert.match(view(address).footerHtml(), /Review payment info/);
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
  assert.match(html, /data-cmd="copy-recipient" aria-label="Copy recipient address"/);
  assert.match(html, /data-cmd="copy-wallet" aria-label="Copy wallet address"/);
  assert.equal((html.match(/title="0x1111111111111111111111111111111111111111"/g) || []).length, 2);
  assert.doesNotMatch(html, /<ul>|<li>/);
  assert.match(modal.footerHtml(), />Confirm payment<\/button>/);
});

test('rental payment review shows monthly rate and immediate ETH deposit', () => {
  const modal = view(address) as { review: unknown; snapshot: { strategy: string; revnetEnabled: boolean }; reviewHtml(): string };
  modal.snapshot.strategy = 'rent';
  modal.review = {
    action: { kind: 'stream', markee: address, monthlyAmount: '2000000000000000' },
    transaction: { from: address, to: address, chainId: 8453, value: '0x38d7ea4c68000' },
    review: { title: 'Start your rental stream', lines: ['Wrap 0.001 ETH into ETHx.'], estimatedGasCost: '11000000000000', reward: 'MARKEE is earned from rent actually spent.' },
  };
  const html = modal.reviewHtml();
  assert.match(html, /<span>Paying<\/span><strong>0\.002 ETHx\/mo<\/strong>/);
  assert.match(html, /<span>Depositing now<\/span><strong>0\.001 ETH<\/strong>/);
  assert.match(html, /Your payment only streams while your message is winning/);
  assert.match(html, /Wrap 0\.001 ETH into ETHx/);
});
