/**
 * Credit Ledger for prepaid clearing credits
 */

export const NETTING_FEE_BPS = 5; // 0.05% of netting volume

export interface Pack {
  id: string;
  name: string;
  credits_usd_micros: number;
  price_usd_cents: number;
}

export const PACKS: Pack[] = [
  { id: 'pack_100k', name: '$100K Credits', credits_usd_micros: 100_000_000_000, price_usd_cents: 100_000_00 },
  { id: 'pack_250k', name: '$250K Credits', credits_usd_micros: 250_000_000_000, price_usd_cents: 250_000_00 },
  { id: 'pack_1m', name: '$1M Credits', credits_usd_micros: 1_000_000_000_000, price_usd_cents: 1_000_000_00 }
];

interface LedgerEntry {
  timestamp_ms: number;
  type: 'credit' | 'debit';
  amount: number;
  reference: string;
  balance_after: number;
}

class CreditLedger {
  private balances = new Map<string, number>();
  private history = new Map<string, LedgerEntry[]>();

  getBalance(agentId: string): number {
    return this.balances.get(agentId) || 0;
  }

  getHistory(agentId: string): LedgerEntry[] {
    return this.history.get(agentId) || [];
  }

  credit(agentId: string, amount: number, reference: string): void {
    const current = this.getBalance(agentId);
    const newBalance = current + amount;
    this.balances.set(agentId, newBalance);

    const entry: LedgerEntry = {
      timestamp_ms: Date.now(),
      type: 'credit',
      amount,
      reference,
      balance_after: newBalance
    };

    const hist = this.history.get(agentId) || [];
    hist.push(entry);
    this.history.set(agentId, hist);
  }

  deduct(agentId: string, amount: number, reference: string): boolean {
    const current = this.getBalance(agentId);
    if (current < amount) return false;

    const newBalance = current - amount;
    this.balances.set(agentId, newBalance);

    const entry: LedgerEntry = {
      timestamp_ms: Date.now(),
      type: 'debit',
      amount,
      reference,
      balance_after: newBalance
    };

    const hist = this.history.get(agentId) || [];
    hist.push(entry);
    this.history.set(agentId, hist);

    return true;
  }

  getTotalCredits(): number {
    let total = 0;
    for (const balance of this.balances.values()) {
      total += balance;
    }
    return total;
  }

  getKPIs(): { total_credits_usd: number; active_agents: number; total_transactions: number } {
    let totalTransactions = 0;
    for (const hist of this.history.values()) {
      totalTransactions += hist.length;
    }
    return {
      total_credits_usd: this.getTotalCredits() / 1_000_000,
      active_agents: this.balances.size,
      total_transactions: totalTransactions
    };
  }
}

export const creditLedger = new CreditLedger();
