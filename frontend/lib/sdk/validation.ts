import { getAddress, isAddress, zeroAddress, type Address } from 'viem';
import type { Action, Placement } from '../../../packages/sdk/src/types';
import { chainConfigMap } from './chains';

export class SDKError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SDKError('INVALID_REQUEST', 'Expected an object.');
  return value as Record<string, unknown>;
}
export function address(value: unknown): Address {
  if (typeof value !== 'string' || !isAddress(value) || getAddress(value) === zeroAddress) throw new SDKError('INVALID_ADDRESS', 'A valid nonzero address is required.');
  return getAddress(value);
}
export function placement(value: unknown): Placement {
  const p = object(value);
  if (typeof p.chainId !== 'number' || !chainConfigMap[p.chainId]) throw new SDKError('UNSUPPORTED_CHAIN', 'Unsupported chain.');
  if (p.kind === 'gardens-community') return { kind: p.kind, chainId: p.chainId, community: address(p.community) };
  if (p.kind === 'board' && [8453, 11155111].includes(p.chainId)) return { kind: p.kind, chainId: p.chainId, address: address(p.address) };
  throw new SDKError('INVALID_PLACEMENT', 'Use a Base/Sepolia board or a supported Gardens community.');
}
export function wei(value: unknown, allowZero = false): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new SDKError('INVALID_AMOUNT', 'Amounts must be decimal wei strings.');
  const amount = BigInt(value);
  if ((!allowZero && amount === 0n) || amount >= 2n ** 256n) throw new SDKError('INVALID_AMOUNT', 'Amount is out of range.');
  return amount;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 4096) throw new SDKError('INVALID_TEXT', 'Message or name is too long.');
  return value;
}
export function parseAction(value: unknown): Action {
  const a = object(value);
  switch (a.kind) {
    case 'create': return { kind: a.kind, message: text(a.message), name: text(a.name), ...(a.amount !== undefined ? { amount: wei(a.amount, true).toString() } : {}) };
    case 'fund': return { kind: a.kind, markee: address(a.markee), amount: wei(a.amount).toString() };
    case 'edit-message': return { kind: a.kind, markee: address(a.markee), message: text(a.message) };
    case 'edit-name': return { kind: a.kind, markee: address(a.markee), name: text(a.name) };
    case 'stream': return { kind: a.kind, markee: address(a.markee), monthlyAmount: wei(a.monthlyAmount).toString() };
    case 'wrap': case 'unwrap': return { kind: a.kind, amount: wei(a.amount).toString() };
    case 'stop': case 'withdraw-buffer': case 'settle': return { kind: a.kind };
    case 'claim-refund': case 'connect-refund': return { kind: a.kind, markee: address(a.markee) };
    case 'claim-top': return { kind: a.kind, markee: address(a.markee) };
    default: throw new SDKError('INVALID_ACTION', 'Unsupported action.');
  }
}
export function assertTextLength(text: string, maxBytes: number) {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new SDKError('TEXT_TOO_LONG', `The contract allows ${maxBytes} UTF-8 bytes.`);
}
