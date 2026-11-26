import type { Address, Placement, PreparedAction } from './types.js';
import { storageOrigins } from './storage-origins.js';

export const RECOVERY_BLOCKED = 'A wallet request may already have been accepted. Check your wallet activity before trying again; Markee will not resend it automatically.';
export const RECOVERY_STORAGE = 'Transaction recovery storage is unavailable. Enable site storage before submitting a payment.';

export type WalletRecovery =
  | { version: 2; phase: 'submitting'; mode: 'direct' | 'batch'; preparation: PreparedAction; at: number }
  | { version: 2; phase: 'direct-submitted'; mode: 'direct'; preparation: PreparedAction; hash: `0x${string}`; at: number }
  | { version: 2; phase: 'receipt-submitted'; mode: 'direct' | 'batch'; preparation: PreparedAction; hash: `0x${string}`; at: number }
  | { version: 2; phase: 'confirmed'; mode: 'direct' | 'batch'; preparation: PreparedAction; hash: `0x${string}`; at: number }
  | { version: 2; phase: 'batch-submitted'; mode: 'batch'; preparation: PreparedAction; batchId: string; at: number };

function valid(record: unknown): record is WalletRecovery {
  if (!record || typeof record !== 'object') return false;
  const r = record as Record<string, unknown>;
  const preparation = r.preparation as Partial<PreparedAction> | undefined;
  return r.version === 2 && typeof r.at === 'number' && Number.isFinite(r.at)
    && !!preparation && typeof preparation.id === 'string'
    && typeof preparation.transaction?.from === 'string' && !!preparation.placement
    && (r.phase === 'submitting' && (r.mode === 'direct' || r.mode === 'batch')
      || r.phase === 'direct-submitted' && r.mode === 'direct' && typeof r.hash === 'string' && /^0x[\da-f]{64}$/i.test(r.hash)
      || r.phase === 'receipt-submitted' && (r.mode === 'direct' || r.mode === 'batch') && typeof r.hash === 'string' && /^0x[\da-f]{64}$/i.test(r.hash)
      || r.phase === 'confirmed' && (r.mode === 'direct' || r.mode === 'batch') && typeof r.hash === 'string' && /^0x[\da-f]{64}$/i.test(r.hash)
      || r.phase === 'batch-submitted' && r.mode === 'batch' && typeof r.batchId === 'string' && !!r.batchId);
}

export function sameWalletPlacement(preparation: PreparedAction, placement: Placement, account: Address): boolean {
  return JSON.stringify(preparation.placement).toLowerCase() === JSON.stringify(placement).toLowerCase()
    && preparation.transaction.from.toLowerCase() === account.toLowerCase();
}

export class WalletRecoveryStore {
  private memory: WalletRecovery[] = [];
  constructor(private readonly apiUrl: string) {}
  private key(origin: string) { return `markee:sdk:v2:wallet-recovery:${origin}`; }
  all(): { record: WalletRecovery; origin: string }[] {
    if (typeof window === 'undefined') return this.memory.map(record => ({ record, origin: this.apiUrl }));
    const found: { record: WalletRecovery; origin: string }[] = [];
    for (const origin of storageOrigins(this.apiUrl)) {
      let raw: string | null;
      try { raw = window.localStorage.getItem(this.key(origin)); }
      catch { throw new Error(RECOVERY_STORAGE); }
      if (!raw) continue;
      try {
        const records: unknown = JSON.parse(raw);
        if (!Array.isArray(records) || !records.every(valid)) throw new Error('invalid record');
        for (const record of records) found.push({ record, origin });
      } catch {
        // An unreadable record may represent a sent payment; never discard it or permit another send.
        throw new Error(RECOVERY_BLOCKED);
      }
    }
    return found;
  }
  forWallet(placement: Placement, account: Address) {
    return this.all().find(({ record }) => sameWalletPlacement(record.preparation, placement, account));
  }
  set(record: WalletRecovery, origin = this.apiUrl): void {
    const all = this.all();
    const samePlacement = (entry: WalletRecovery) => sameWalletPlacement(entry.preparation, record.preparation.placement, record.preparation.transaction.from);
    if (record.phase === 'submitting' && all.some(({ record: prior }) => samePlacement(prior) && prior.phase !== 'confirmed')) throw new Error(RECOVERY_BLOCKED);
    const records = all.filter(entry => entry.origin === origin).map(entry => entry.record)
      .filter(entry => entry.preparation.id !== record.preparation.id && !(record.phase === 'submitting' && samePlacement(entry) && entry.phase === 'confirmed'));
    records.push(record);
    this.write(origin, records);
  }
  clear(preparation: PreparedAction, origin = this.apiUrl): void {
    const records = this.all().filter(entry => entry.origin === origin).map(entry => entry.record)
      .filter(entry => entry.preparation.id !== preparation.id);
    this.write(origin, records);
  }
  private write(origin: string, records: WalletRecovery[]) {
    if (typeof window === 'undefined') { this.memory = records; return; }
    const json = JSON.stringify(records);
    try {
      window.localStorage.setItem(this.key(origin), json);
      if (window.localStorage.getItem(this.key(origin)) !== json) throw new Error('not retained');
    } catch { throw new Error(RECOVERY_STORAGE); }
  }
}
