// Primordia Clearing Kernel Types

export interface MultiSignedReceipt {
  payload: any;
  signatures: {
    agent_id: string;
    signature: string;
    pubkey: string;
  }[];
  timestamp: number;
  hash: string;
}

export interface NettingRequest {
  agent_id: string;
  receipts: MultiSignedReceipt[];
}

export interface NettingResponse {
  ian_signed: MultiSignedReceipt;
  netting_hash: string;
  fee_charged: number;
}

export interface VerifyRequest {
  type: 'msr' | 'ian' | 'fc' | 'seal';
  payload: any;
}

export interface VerifyResponse {
  valid: boolean;
  hash: string;
  details?: any;
}

export interface CreditPack {
  pack_id: 'pack_dev' | 'pack_5k' | '100k' | '250k' | '1m';
  amount_usd: number;
  price_usd: number;
}

export interface CreateIntentRequest {
  pack_id: string;
  agent_id: string;
}

export interface CreateIntentResponse {
  checkout_url: string;
  session_id: string;
}

export interface CreditLineOpenRequest {
  agent_id: string;
  mbs: string; // Mortgage-Backed Security reference
  limit_usd_micros: number;
  terms_hash: string;
}

export interface CreditLineOpenResponse {
  credit_line_id: string;
}

export interface CreditDrawRequest {
  credit_line_id: string;
  amount_usd_micros: number;
}

export interface CreditDrawResponse {
  draw_id: string;
  msr: MultiSignedReceipt;
}

export interface FidelityCertificateCommitRequest {
  agent_id: string;
  fc: {
    certificate_hash: string;
    conformance_level: string;
    timestamp: number;
  };
}

export interface FidelityCertificateCommitResponse {
  commitment_id: string;
}

export interface DefaultTriggerRequest {
  agent_id: string;
  reason_code: string;
}

export interface DefaultTriggerResponse {
  default_id: string;
  triggered_at: number;
}

export interface DefaultResolveRequest {
  default_id: string;
  action: 'restructure' | 'liquidate' | 'cure';
  params: any;
}

export interface DefaultResolveResponse {
  resolution_receipt_id: string;
}

export interface SealIssueRequest {
  target_base_url: string;
  conformance_report_hash: string;
}

export interface SealIssueResponse {
  seal: {
    target_base_url: string;
    conformance_report_hash: string;
    issued_at: number;
    issued_by: string;
    signature: string;
  };
}

export interface SealVerifyRequest {
  seal: {
    target_base_url: string;
    conformance_report_hash: string;
    issued_at: number;
    issued_by: string;
    signature: string;
  };
}

export interface SealVerifyResponse {
  valid: boolean;
  details?: any;
}

export interface CreditLedgerEntry {
  agent_id: string;
  balance_usd_micros: number;
  transactions: {
    type: 'credit' | 'debit' | 'fee';
    amount_usd_micros: number;
    timestamp: number;
    reference: string;
  }[];
}

export interface CreditLine {
  credit_line_id: string;
  agent_id: string;
  mbs: string;
  limit_usd_micros: number;
  drawn_usd_micros: number;
  terms_hash: string;
  opened_at: number;
}

export interface DefaultCase {
  default_id: string;
  agent_id: string;
  reason_code: string;
  triggered_at: number;
  resolved: boolean;
  resolution?: {
    action: string;
    params: any;
    resolved_at: number;
  };
}
