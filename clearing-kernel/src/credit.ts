// Credit Ledger and Management

import { CreditLedgerEntry, CreditLine, DefaultCase } from './types.js';

export class CreditService {
  private ledger: Map<string, CreditLedgerEntry>;
  private creditLines: Map<string, CreditLine>;
  private defaults: Map<string, DefaultCase>;

  constructor() {
    this.ledger = new Map();
    this.creditLines = new Map();
    this.defaults = new Map();
  }

  /**
   * Get agent's credit balance
   */
  getBalance(agent_id: string): number {
    const entry = this.ledger.get(agent_id);
    return entry ? entry.balance_usd_micros : 0;
  }

  /**
   * Add credit to agent's account
   */
  addCredit(agent_id: string, amount_usd_micros: number, reference: string): void {
    let entry = this.ledger.get(agent_id);

    if (!entry) {
      entry = {
        agent_id,
        balance_usd_micros: 0,
        transactions: []
      };
      this.ledger.set(agent_id, entry);
    }

    entry.balance_usd_micros += amount_usd_micros;
    entry.transactions.push({
      type: 'credit',
      amount_usd_micros,
      timestamp: Date.now(),
      reference
    });
  }

  /**
   * Deduct credit from agent's account
   */
  deductCredit(agent_id: string, amount_usd_micros: number, reference: string): boolean {
    const entry = this.ledger.get(agent_id);

    if (!entry || entry.balance_usd_micros < amount_usd_micros) {
      return false;
    }

    entry.balance_usd_micros -= amount_usd_micros;
    entry.transactions.push({
      type: 'debit',
      amount_usd_micros,
      timestamp: Date.now(),
      reference
    });

    return true;
  }

  /**
   * Charge a fee
   */
  chargeFee(agent_id: string, amount_usd_micros: number, reference: string): boolean {
    const entry = this.ledger.get(agent_id);

    if (!entry || entry.balance_usd_micros < amount_usd_micros) {
      return false;
    }

    entry.balance_usd_micros -= amount_usd_micros;
    entry.transactions.push({
      type: 'fee',
      amount_usd_micros,
      timestamp: Date.now(),
      reference
    });

    return true;
  }

  /**
   * Check if agent has sufficient credit
   */
  hasSufficientCredit(agent_id: string, required_amount_usd_micros: number): boolean {
    const balance = this.getBalance(agent_id);
    return balance >= required_amount_usd_micros;
  }

  /**
   * Get ledger entry
   */
  getLedgerEntry(agent_id: string): CreditLedgerEntry | undefined {
    return this.ledger.get(agent_id);
  }

  /**
   * Open a credit line
   */
  openCreditLine(
    agent_id: string,
    mbs: string,
    limit_usd_micros: number,
    terms_hash: string
  ): string {
    const credit_line_id = `cl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const creditLine: CreditLine = {
      credit_line_id,
      agent_id,
      mbs,
      limit_usd_micros,
      drawn_usd_micros: 0,
      terms_hash,
      opened_at: Date.now()
    };

    this.creditLines.set(credit_line_id, creditLine);
    return credit_line_id;
  }

  /**
   * Draw from a credit line
   */
  drawFromCreditLine(credit_line_id: string, amount_usd_micros: number): string | null {
    const creditLine = this.creditLines.get(credit_line_id);

    if (!creditLine) {
      return null;
    }

    const available = creditLine.limit_usd_micros - creditLine.drawn_usd_micros;
    if (amount_usd_micros > available) {
      return null;
    }

    creditLine.drawn_usd_micros += amount_usd_micros;

    // Add credit to agent's account
    const draw_id = `draw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.addCredit(creditLine.agent_id, amount_usd_micros, `credit_line_draw:${draw_id}`);

    return draw_id;
  }

  /**
   * Get credit line
   */
  getCreditLine(credit_line_id: string): CreditLine | undefined {
    return this.creditLines.get(credit_line_id);
  }

  /**
   * Trigger a default case
   */
  triggerDefault(agent_id: string, reason_code: string): string {
    const default_id = `def_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const defaultCase: DefaultCase = {
      default_id,
      agent_id,
      reason_code,
      triggered_at: Date.now(),
      resolved: false
    };

    this.defaults.set(default_id, defaultCase);
    return default_id;
  }

  /**
   * Resolve a default case
   */
  resolveDefault(default_id: string, action: string, params: any): string | null {
    const defaultCase = this.defaults.get(default_id);

    if (!defaultCase || defaultCase.resolved) {
      return null;
    }

    defaultCase.resolved = true;
    defaultCase.resolution = {
      action,
      params,
      resolved_at: Date.now()
    };

    const resolution_receipt_id = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return resolution_receipt_id;
  }

  /**
   * Get default case
   */
  getDefaultCase(default_id: string): DefaultCase | undefined {
    return this.defaults.get(default_id);
  }
}
