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
