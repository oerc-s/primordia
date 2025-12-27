// PRIMORDIA CREDIT SERVICE (RAIL-2) v0.1
// Clearing-grade credit primitives with seal-gating and 402 enforcement

import { hash, sign } from './crypto.js';
import { canonicalizeBytes } from './canonical.js';
import * as db from './db.js';

// Fee structure (in USD micros)
const FEES = {
  LINE_OPEN_BPS: 50,        // 0.5% of limit
  LINE_UPDATE: 10_000_000,  // $10
  LINE_CLOSE: 0,
  DRAW_BPS: 10,             // 0.1% of draw
  REPAY: 0,
  INTEREST_ACCRUE: 1_000_000, // $1
  FEE_APPLY: 1_000_000,     // $1
  MARGIN_CALL: 100_000_000, // $100
  COLLATERAL_LOCK: 10_000_000, // $10
  COLLATERAL_UNLOCK: 10_000_000, // $10
  LIQUIDATION_BPS: 500,     // 5% of liquidated value
};

export interface CreditLineParams {
  borrower_agent_id: string;
  lender_agent_id: string;
  limit_usd_micros: number;
  spread_bps?: number;
  maturity_ts?: number;
  collateral_ratio_min_bps?: number;
  request_hash: string;
}

export interface DrawParams {
  credit_line_id: string;
  agent_id: string;
  amount_usd_micros: number;
  request_hash: string;
}

export interface RepayParams {
  credit_line_id: string;
  agent_id: string;
  principal_usd_micros?: number;
  interest_usd_micros?: number;
  fees_usd_micros?: number;
  request_hash: string;
}

export interface InterestAccrueParams {
  credit_line_id: string;
  agent_id: string;
  window_id: string;
  days?: number;
  request_hash: string;
}

export interface FeeParams {
  credit_line_id: string;
  agent_id: string;
  fee_type: 'origination' | 'late' | 'maintenance' | 'other';
  amount_usd_micros: number;
  reason: string;
  request_hash: string;
}

export interface MarginCallParams {
  credit_line_id: string;
  agent_id: string;
  action: 'call' | 'resolve' | 'escalate';
  reason?: string;
  required_usd_micros?: number;
  due_ts?: number;
  margin_call_id?: string;
  request_hash: string;
}

export interface CollateralParams {
  credit_line_id: string;
  agent_id: string;
  action: 'lock' | 'unlock';
  asset_ref: string;
  asset_type: 'ian' | 'msr' | 'fc' | 'external';
  amount_usd_micros: number;
  collateral_lock_id?: string;
  request_hash: string;
}

export interface LiquidateParams {
  credit_line_id: string;
  agent_id: string;
  margin_call_id: string;
  request_hash: string;
}

export class CreditService {
  private kernelPrivateKey: string;
  private kernelPublicKey: string;

  constructor(kernelPrivateKey: string, kernelPublicKey: string) {
    this.kernelPrivateKey = kernelPrivateKey;
    this.kernelPublicKey = kernelPublicKey;
  }

  // Calculate operation fee
  calculateFee(operation: string, amount?: number): number {
    switch (operation) {
      case 'line_open':
        return Math.floor((amount || 0) * FEES.LINE_OPEN_BPS / 10000);
      case 'line_update':
        return FEES.LINE_UPDATE;
      case 'line_close':
        return FEES.LINE_CLOSE;
      case 'draw':
        return Math.floor((amount || 0) * FEES.DRAW_BPS / 10000);
      case 'repay':
        return FEES.REPAY;
      case 'interest_accrue':
        return FEES.INTEREST_ACCRUE;
      case 'fee_apply':
        return FEES.FEE_APPLY;
      case 'margin_call':
        return FEES.MARGIN_CALL;
      case 'collateral_lock':
        return FEES.COLLATERAL_LOCK;
      case 'collateral_unlock':
        return FEES.COLLATERAL_UNLOCK;
      case 'liquidate':
        return Math.floor((amount || 0) * FEES.LIQUIDATION_BPS / 10000);
      default:
        return 0;
    }
  }

  // Check idempotency - returns existing receipt if request_hash exists
  async checkIdempotency(request_hash: string): Promise<any | null> {
    const result = await db.query(
      `SELECT payload_json, receipt_hash FROM credit_events WHERE request_hash = $1`,
      [request_hash]
    );
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return null;
  }

  // Generate credit line ID
  generateCreditLineId(): string {
    return `cl_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  // Sign receipt
  async signReceipt(receipt: any): Promise<string> {
    const receiptHash = hash(canonicalizeBytes(receipt));
    const signature = await sign(receiptHash, this.kernelPrivateKey);
    return signature;
  }

  // Open credit line
  async openLine(params: CreditLineParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    // Check idempotency
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(existing.payload_json.credit_line_id),
        fee_charged: 0
      };
    }

    const credit_line_id = this.generateCreditLineId();
    const timestamp_ms = Date.now();
    const fee = this.calculateFee('line_open', params.limit_usd_micros);

    // Create credit line
    await db.query(
      `INSERT INTO credit_lines
       (credit_line_id, borrower_agent_id, lender_agent_id, limit_usd_micros, spread_bps, maturity_ts, collateral_ratio_min_bps)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        credit_line_id,
        params.borrower_agent_id,
        params.lender_agent_id,
        params.limit_usd_micros,
        params.spread_bps || 200,
        params.maturity_ts || null,
        params.collateral_ratio_min_bps || 15000
      ]
    );

    // Create position
    await db.query(
      `INSERT INTO credit_positions
       (credit_line_id, borrower_agent_id, lender_agent_id)
       VALUES ($1, $2, $3)`,
      [credit_line_id, params.borrower_agent_id, params.lender_agent_id]
    );

    // Create receipt
    const receipt: any = {
      cl_version: '0.1',
      receipt_type: 'CL',
      action: 'open',
      issuer: 'clearing-kernel',
      subject_agent_id: params.borrower_agent_id,
      counterparty_agent_id: params.lender_agent_id,
      credit_line_id,
      limit_usd_micros: params.limit_usd_micros,
      spread_bps: params.spread_bps || 200,
      maturity_ts: params.maturity_ts || null,
      status: 'active',
      seal_required: true,
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    // Store event
    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [credit_line_id, 'CL_OPEN', receipt, params.request_hash, receiptHash]
    );

    // Store in receipts table for MBS derivation
    await db.storeReceipt(receiptHash, 'cl', receipt, params.borrower_agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(credit_line_id),
      fee_charged: fee
    };
  }

  // Draw from credit line
  async draw(params: DrawParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    // Check idempotency
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(params.credit_line_id),
        fee_charged: 0
      };
    }

    // Get credit line and position
    const line = await this.getCreditLine(params.credit_line_id);
    if (!line) throw new Error('Credit line not found');
    if (line.status !== 'active') throw new Error('Credit line not active');
    if (line.borrower_agent_id !== params.agent_id) throw new Error('Not the borrower');

    const position = await this.getPosition(params.credit_line_id);
    const available = line.limit_usd_micros - position.principal_usd_micros;
    if (params.amount_usd_micros > available) {
      throw new Error(`Insufficient available credit: ${available} < ${params.amount_usd_micros}`);
    }

    const timestamp_ms = Date.now();
    const fee = this.calculateFee('draw', params.amount_usd_micros);
    const new_principal = position.principal_usd_micros + params.amount_usd_micros;

    // Update position
    await db.query(
      `UPDATE credit_positions SET principal_usd_micros = $1, updated_at = NOW() WHERE credit_line_id = $2`,
      [new_principal, params.credit_line_id]
    );

    // Create receipt
    const receipt: any = {
      draw_version: '0.1',
      receipt_type: 'DRAW',
      issuer: 'clearing-kernel',
      subject_agent_id: params.agent_id,
      credit_line_id: params.credit_line_id,
      draw_amount_usd_micros: params.amount_usd_micros,
      new_principal_usd_micros: new_principal,
      available_usd_micros: line.limit_usd_micros - new_principal,
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    // Store event
    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, delta_principal_usd_micros, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [params.credit_line_id, 'DRAW', params.amount_usd_micros, receipt, params.request_hash, receiptHash]
    );

    await db.storeReceipt(receiptHash, 'draw', receipt, params.agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(params.credit_line_id),
      fee_charged: fee
    };
  }

  // Repay credit
  async repay(params: RepayParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(params.credit_line_id),
        fee_charged: 0
      };
    }

    const line = await this.getCreditLine(params.credit_line_id);
    if (!line) throw new Error('Credit line not found');
    if (line.borrower_agent_id !== params.agent_id) throw new Error('Not the borrower');

    const position = await this.getPosition(params.credit_line_id);
    const timestamp_ms = Date.now();

    const repay_fees = Math.min(params.fees_usd_micros || 0, position.fees_usd_micros);
    const repay_interest = Math.min(params.interest_usd_micros || 0, position.interest_accrued_usd_micros);
    const repay_principal = Math.min(params.principal_usd_micros || 0, position.principal_usd_micros);

    const new_fees = position.fees_usd_micros - repay_fees;
    const new_interest = position.interest_accrued_usd_micros - repay_interest;
    const new_principal = position.principal_usd_micros - repay_principal;

    // Update position
    await db.query(
      `UPDATE credit_positions
       SET principal_usd_micros = $1, interest_accrued_usd_micros = $2, fees_usd_micros = $3, updated_at = NOW()
       WHERE credit_line_id = $4`,
      [new_principal, new_interest, new_fees, params.credit_line_id]
    );

    const receipt: any = {
      repay_version: '0.1',
      receipt_type: 'REPAY',
      issuer: 'clearing-kernel',
      subject_agent_id: params.agent_id,
      credit_line_id: params.credit_line_id,
      repay_principal_usd_micros: repay_principal,
      repay_interest_usd_micros: repay_interest,
      repay_fees_usd_micros: repay_fees,
      new_principal_usd_micros: new_principal,
      new_interest_usd_micros: new_interest,
      new_fees_usd_micros: new_fees,
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, delta_principal_usd_micros, delta_interest_usd_micros, delta_fees_usd_micros, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [params.credit_line_id, 'REPAY', -repay_principal, -repay_interest, -repay_fees, receipt, params.request_hash, receiptHash]
    );

    await db.storeReceipt(receiptHash, 'repay', receipt, params.agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(params.credit_line_id),
      fee_charged: 0
    };
  }

  // Accrue interest
  async accrueInterest(params: InterestAccrueParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(params.credit_line_id),
        fee_charged: 0
      };
    }

    const line = await this.getCreditLine(params.credit_line_id);
    if (!line) throw new Error('Credit line not found');

    const position = await this.getPosition(params.credit_line_id);
    const timestamp_ms = Date.now();
    const fee = this.calculateFee('interest_accrue');

    // Calculate interest: principal * spread_bps / 10000 * days / 365
    const days = params.days || 30;
    const interest = Math.floor(position.principal_usd_micros * line.spread_bps / 10000 * days / 365);
    const new_interest = position.interest_accrued_usd_micros + interest;

    await db.query(
      `UPDATE credit_positions
       SET interest_accrued_usd_micros = $1, last_accrual_ts = $2, last_accrual_window = $3, updated_at = NOW()
       WHERE credit_line_id = $4`,
      [new_interest, timestamp_ms, params.window_id, params.credit_line_id]
    );

    const receipt: any = {
      iar_version: '0.1',
      receipt_type: 'IAR',
      issuer: 'clearing-kernel',
      subject_agent_id: line.borrower_agent_id,
      credit_line_id: params.credit_line_id,
      window_id: params.window_id,
      principal_usd_micros: position.principal_usd_micros,
      spread_bps: line.spread_bps,
      days_accrued: days,
      interest_accrued_usd_micros: interest,
      new_interest_total_usd_micros: new_interest,
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, delta_interest_usd_micros, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [params.credit_line_id, 'IAR', interest, receipt, params.request_hash, receiptHash]
    );

    await db.storeReceipt(receiptHash, 'iar', receipt, line.borrower_agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(params.credit_line_id),
      fee_charged: fee
    };
  }

  // Apply fee
  async applyFee(params: FeeParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(params.credit_line_id),
        fee_charged: 0
      };
    }

    const line = await this.getCreditLine(params.credit_line_id);
    if (!line) throw new Error('Credit line not found');

    const position = await this.getPosition(params.credit_line_id);
    const timestamp_ms = Date.now();
    const operation_fee = this.calculateFee('fee_apply');
    const new_fees = position.fees_usd_micros + params.amount_usd_micros;

    await db.query(
      `UPDATE credit_positions SET fees_usd_micros = $1, updated_at = NOW() WHERE credit_line_id = $2`,
      [new_fees, params.credit_line_id]
    );

    const receipt: any = {
      fee_version: '0.1',
      receipt_type: 'FEE',
      issuer: 'clearing-kernel',
      subject_agent_id: line.borrower_agent_id,
      credit_line_id: params.credit_line_id,
      fee_type: params.fee_type,
      fee_amount_usd_micros: params.amount_usd_micros,
      new_fees_total_usd_micros: new_fees,
      reason: params.reason,
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, delta_fees_usd_micros, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [params.credit_line_id, 'FEE', params.amount_usd_micros, receipt, params.request_hash, receiptHash]
    );

    await db.storeReceipt(receiptHash, 'fee', receipt, line.borrower_agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(params.credit_line_id),
      fee_charged: operation_fee
    };
  }

  // Lock collateral
  async lockCollateral(params: CollateralParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(params.credit_line_id),
        fee_charged: 0
      };
    }

    const line = await this.getCreditLine(params.credit_line_id);
    if (!line) throw new Error('Credit line not found');

    const timestamp_ms = Date.now();
    const fee = this.calculateFee('collateral_lock');

    // Create collateral lock
    const result = await db.query(
      `INSERT INTO collateral_locks (credit_line_id, asset_ref, asset_type, amount_usd_micros, status)
       VALUES ($1, $2, $3, $4, 'locked')
       RETURNING collateral_lock_id`,
      [params.credit_line_id, params.asset_ref, params.asset_type, params.amount_usd_micros]
    );
    const collateral_lock_id = result.rows[0].collateral_lock_id;

    const receipt: any = {
      coll_version: '0.1',
      receipt_type: 'COLL',
      issuer: 'clearing-kernel',
      subject_agent_id: line.borrower_agent_id,
      credit_line_id: params.credit_line_id,
      collateral_lock_id,
      action: 'lock',
      asset_ref: params.asset_ref,
      asset_type: params.asset_type,
      amount_usd_micros: params.amount_usd_micros,
      status: 'locked',
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.credit_line_id, 'COLL_LOCK', receipt, params.request_hash, receiptHash]
    );

    await db.storeReceipt(receiptHash, 'coll', receipt, line.borrower_agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(params.credit_line_id),
      fee_charged: fee
    };
  }

  // Unlock collateral
  async unlockCollateral(params: CollateralParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(params.credit_line_id),
        fee_charged: 0
      };
    }

    if (!params.collateral_lock_id) throw new Error('collateral_lock_id required for unlock');

    const lock = await db.query(
      `SELECT * FROM collateral_locks WHERE collateral_lock_id = $1 AND status = 'locked'`,
      [params.collateral_lock_id]
    );
    if (lock.rows.length === 0) throw new Error('Collateral lock not found or not locked');

    const line = await this.getCreditLine(params.credit_line_id);
    if (!line) throw new Error('Credit line not found');

    const timestamp_ms = Date.now();
    const fee = this.calculateFee('collateral_unlock');

    await db.query(
      `UPDATE collateral_locks SET status = 'unlocked', unlocked_at = NOW() WHERE collateral_lock_id = $1`,
      [params.collateral_lock_id]
    );

    const receipt: any = {
      coll_version: '0.1',
      receipt_type: 'COLL',
      issuer: 'clearing-kernel',
      subject_agent_id: line.borrower_agent_id,
      credit_line_id: params.credit_line_id,
      collateral_lock_id: params.collateral_lock_id,
      action: 'unlock',
      asset_ref: lock.rows[0].asset_ref,
      amount_usd_micros: lock.rows[0].amount_usd_micros,
      status: 'unlocked',
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.credit_line_id, 'COLL_UNLOCK', receipt, params.request_hash, receiptHash]
    );

    await db.storeReceipt(receiptHash, 'coll', receipt, line.borrower_agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(params.credit_line_id),
      fee_charged: fee
    };
  }

  // Margin call
  async marginCall(params: MarginCallParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(params.credit_line_id),
        fee_charged: 0
      };
    }

    const line = await this.getCreditLine(params.credit_line_id);
    if (!line) throw new Error('Credit line not found');

    const timestamp_ms = Date.now();
    const fee = this.calculateFee('margin_call');
    let margin_call_id = params.margin_call_id;
    let status = 'pending';

    if (params.action === 'call') {
      if (!params.required_usd_micros || !params.due_ts) {
        throw new Error('required_usd_micros and due_ts required for margin call');
      }
      const result = await db.query(
        `INSERT INTO margin_calls (credit_line_id, reason, required_usd_micros, due_ts)
         VALUES ($1, $2, $3, $4)
         RETURNING margin_call_id`,
        [params.credit_line_id, params.reason || 'Collateral ratio below threshold', params.required_usd_micros, params.due_ts]
      );
      margin_call_id = result.rows[0].margin_call_id;
    } else if (params.action === 'resolve') {
      await db.query(
        `UPDATE margin_calls SET status = 'resolved', resolved_ts = $1 WHERE margin_call_id = $2`,
        [timestamp_ms, params.margin_call_id]
      );
      status = 'resolved';
    } else if (params.action === 'escalate') {
      await db.query(
        `UPDATE margin_calls SET status = 'escalated' WHERE margin_call_id = $1`,
        [params.margin_call_id]
      );
      status = 'escalated';
    }

    const receipt: any = {
      margin_version: '0.1',
      receipt_type: 'MARGIN',
      issuer: 'clearing-kernel',
      subject_agent_id: line.borrower_agent_id,
      credit_line_id: params.credit_line_id,
      margin_call_id,
      action: params.action,
      reason: params.reason || 'Collateral ratio below threshold',
      required_usd_micros: params.required_usd_micros,
      due_ts: params.due_ts,
      status,
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.credit_line_id, params.action === 'call' ? 'MARGIN_CALL' : 'MARGIN_RESOLVE', receipt, params.request_hash, receiptHash]
    );

    await db.storeReceipt(receiptHash, 'margin', receipt, line.borrower_agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(params.credit_line_id),
      fee_charged: fee
    };
  }

  // Liquidate
  async liquidate(params: LiquidateParams): Promise<{ receipt: any; position: any; fee_charged: number }> {
    const existing = await this.checkIdempotency(params.request_hash);
    if (existing) {
      return {
        receipt: existing.payload_json,
        position: await this.getPosition(params.credit_line_id),
        fee_charged: 0
      };
    }

    const line = await this.getCreditLine(params.credit_line_id);
    if (!line) throw new Error('Credit line not found');

    const position = await this.getPosition(params.credit_line_id);
    const timestamp_ms = Date.now();

    // Get all locked collateral
    const collateral = await db.query(
      `SELECT * FROM collateral_locks WHERE credit_line_id = $1 AND status = 'locked'`,
      [params.credit_line_id]
    );

    let total_collateral = 0;
    const collateral_liquidated = [];
    for (const lock of collateral.rows) {
      total_collateral += lock.amount_usd_micros;
      collateral_liquidated.push({
        collateral_lock_id: lock.collateral_lock_id,
        amount_usd_micros: lock.amount_usd_micros
      });
      await db.query(
        `UPDATE collateral_locks SET status = 'liquidated' WHERE collateral_lock_id = $1`,
        [lock.collateral_lock_id]
      );
    }

    const fee = this.calculateFee('liquidate', total_collateral);
    const net_collateral = total_collateral - fee;

    // Waterfall: fees -> interest -> principal
    let remaining = net_collateral;
    const fees_covered = Math.min(remaining, position.fees_usd_micros);
    remaining -= fees_covered;
    const interest_covered = Math.min(remaining, position.interest_accrued_usd_micros);
    remaining -= interest_covered;
    const principal_covered = Math.min(remaining, position.principal_usd_micros);
    remaining -= principal_covered;

    const shortfall = position.principal_usd_micros + position.interest_accrued_usd_micros + position.fees_usd_micros
      - fees_covered - interest_covered - principal_covered;

    // Update position
    await db.query(
      `UPDATE credit_positions
       SET principal_usd_micros = $1, interest_accrued_usd_micros = $2, fees_usd_micros = $3, updated_at = NOW()
       WHERE credit_line_id = $4`,
      [
        position.principal_usd_micros - principal_covered,
        position.interest_accrued_usd_micros - interest_covered,
        position.fees_usd_micros - fees_covered,
        params.credit_line_id
      ]
    );

    // Update credit line status
    await db.query(
      `UPDATE credit_lines SET status = 'liquidated', updated_at = NOW() WHERE credit_line_id = $1`,
      [params.credit_line_id]
    );

    // Update margin call
    await db.query(
      `UPDATE margin_calls SET status = 'liquidated' WHERE margin_call_id = $1`,
      [params.margin_call_id]
    );

    const receipt: any = {
      liq_version: '0.1',
      receipt_type: 'LIQ',
      issuer: 'clearing-kernel',
      subject_agent_id: line.borrower_agent_id,
      credit_line_id: params.credit_line_id,
      margin_call_id: params.margin_call_id,
      collateral_liquidated,
      total_collateral_usd_micros: total_collateral,
      liquidation_fee_usd_micros: fee,
      principal_covered_usd_micros: principal_covered,
      interest_covered_usd_micros: interest_covered,
      fees_covered_usd_micros: fees_covered,
      shortfall_usd_micros: shortfall,
      new_status: 'liquidated',
      request_hash: params.request_hash,
      timestamp_ms,
      kernel_pubkey: this.kernelPublicKey
    };

    const receiptHash = hash(canonicalizeBytes(receipt));
    receipt.receipt_hash = receiptHash;
    receipt.kernel_signature = await this.signReceipt(receipt);

    await db.query(
      `INSERT INTO credit_events
       (credit_line_id, event_type, delta_principal_usd_micros, delta_interest_usd_micros, delta_fees_usd_micros, payload_json, request_hash, receipt_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [params.credit_line_id, 'LIQ', -principal_covered, -interest_covered, -fees_covered, receipt, params.request_hash, receiptHash]
    );

    await db.storeReceipt(receiptHash, 'liq', receipt, line.borrower_agent_id, undefined, params.request_hash);

    return {
      receipt,
      position: await this.getPosition(params.credit_line_id),
      fee_charged: fee
    };
  }

  // Helper: get credit line
  async getCreditLine(credit_line_id: string): Promise<any | null> {
    const result = await db.query(
      `SELECT * FROM credit_lines WHERE credit_line_id = $1`,
      [credit_line_id]
    );
    return result.rows[0] || null;
  }

  // Helper: get position with collateral
  async getPosition(credit_line_id: string): Promise<any> {
    const pos = await db.query(
      `SELECT * FROM credit_positions WHERE credit_line_id = $1`,
      [credit_line_id]
    );
    const line = await this.getCreditLine(credit_line_id);
    const collateral = await db.query(
      `SELECT COALESCE(SUM(amount_usd_micros), 0) as total FROM collateral_locks WHERE credit_line_id = $1 AND status = 'locked'`,
      [credit_line_id]
    );

    const position = pos.rows[0] || {
      principal_usd_micros: 0,
      interest_accrued_usd_micros: 0,
      fees_usd_micros: 0
    };

    const collateral_locked = parseInt(collateral.rows[0]?.total || '0');
    const total_owed = position.principal_usd_micros + position.interest_accrued_usd_micros + position.fees_usd_micros;
    const collateral_ratio_bps = total_owed > 0 ? Math.floor(collateral_locked * 10000 / total_owed) : 0;

    return {
      credit_line_id,
      borrower_agent_id: line?.borrower_agent_id,
      lender_agent_id: line?.lender_agent_id,
      limit_usd_micros: line?.limit_usd_micros || 0,
      principal_usd_micros: position.principal_usd_micros,
      interest_accrued_usd_micros: position.interest_accrued_usd_micros,
      fees_usd_micros: position.fees_usd_micros,
      available_usd_micros: (line?.limit_usd_micros || 0) - position.principal_usd_micros,
      collateral_locked_usd_micros: collateral_locked,
      collateral_ratio_bps,
      status: line?.status || 'unknown',
      as_of_ts: Date.now()
    };
  }
}
