// Primordia Clearing Kernel Server v0.1.0
// Multi-Agent Settlement Infrastructure with PostgreSQL Persistence

import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { hash, sign, verify, generateKeypair } from './crypto.js';
import { canonicalizeBytes } from './canonical.js';
import { StripeService } from './stripe-service.js';
import { CreditService } from './credit-service.js';
import * as db from './db.js';
import { registerALREndpoints } from './alr.js';
import type {
  NettingRequest,
  NettingResponse,
  VerifyRequest,
  VerifyResponse,
  CreateIntentRequest,
  CreateIntentResponse,
  CreditLineOpenRequest,
  CreditLineOpenResponse,
  CreditDrawRequest,
  CreditDrawResponse,
  FidelityCertificateCommitRequest,
  FidelityCertificateCommitResponse,
  DefaultTriggerRequest,
  DefaultTriggerResponse,
  DefaultResolveRequest,
  DefaultResolveResponse,
  SealIssueRequest,
  SealIssueResponse,
  SealVerifyRequest,
  SealVerifyResponse,
  MultiSignedReceipt
} from './types.js';

dotenv.config();

// Environment Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const NETTING_FEE_BPS = parseInt(process.env.NETTING_FEE_BPS || '5', 10);
const CREDIT_SPREAD_BPS = parseInt(process.env.CREDIT_SPREAD_BPS || '200', 10);
const FREE_TIER_RATE_LIMIT = parseInt(process.env.FREE_TIER_RATE_LIMIT || '100', 10);
const FREE_TIER_WINDOW_MS = parseInt(process.env.FREE_TIER_WINDOW_MS || '60000', 10);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'admin-key-change-me';
const DEFAULT_RESOLVE_FEE_USD_MICROS = 25_000_000_000; // $25,000

// =====================
// FORCING THRESHOLDS
// =====================
const NETTING_THRESHOLD_RECEIPTS = parseInt(process.env.NETTING_THRESHOLD_RECEIPTS || '100', 10);
const NETTING_THRESHOLD_COUNTERPARTIES = parseInt(process.env.NETTING_THRESHOLD_COUNTERPARTIES || '5', 10);
const NETTING_THRESHOLD_USD_MICROS = parseInt(process.env.NETTING_THRESHOLD_USD_MICROS || '10000000000', 10); // $10K
const FREE_INDEX_DAILY_LIMIT = parseInt(process.env.FREE_INDEX_DAILY_LIMIT || '10000', 10);

// Kernel Key Management
let KERNEL_PRIVATE_KEY = process.env.KERNEL_PRIVATE_KEY || '';
let KERNEL_PUBLIC_KEY = process.env.KERNEL_PUBLIC_KEY || '';

// Generate keys if not provided
if (!KERNEL_PRIVATE_KEY) {
  const keys = await generateKeypair();
  KERNEL_PRIVATE_KEY = keys.privateKey;
  KERNEL_PUBLIC_KEY = keys.publicKey;
  console.log('Generated kernel keypair');
  console.log('KERNEL_PUBLIC_KEY=' + KERNEL_PUBLIC_KEY);
}

// Initialize Database
await db.initDatabase();

// Initialize Stripe Service
let stripeService: StripeService | null = null;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET) {
  stripeService = new StripeService(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET);
} else {
  console.warn('Warning: Stripe credentials not configured. Payment endpoints will fail.');
}

// Express App Setup
const app = express();

// Security Middleware
app.use(helmet());
app.use(cors());

// Rate Limiter for Free Tier
const freeTierLimiter = rateLimit({
  windowMs: FREE_TIER_WINDOW_MS,
  max: FREE_TIER_RATE_LIMIT,
  message: { error: 'Rate limit exceeded for free tier endpoints' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin Authentication Middleware
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-admin-api-key'];
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin API key' });
  }
  next();
};

// Credit Requirement Middleware
const requireCredit = (minAmount: number = 0) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const agent_id = req.body.agent_id || req.body.org_id;
    if (!agent_id) {
      return res.status(400).json({ error: 'Missing agent_id' });
    }

    const balance = await db.getBalance(agent_id);
    if (balance < minAmount) {
      return res.status(402).json({
        error: 'BOOKS OPEN — CREDIT REQUIRED',
        message: 'Insufficient credit balance. Please purchase credit to continue.',
        required_usd_micros: minAmount,
        current_balance_usd_micros: balance,
        purchase_url: '/v1/credit/packs'
      });
    }
    next();
  };
};

// Seal Requirement for Clearing-Grade Operations
const requireSeal = async (agent_id: string): Promise<{ valid: boolean; seal?: any }> => {
  const seal = await db.getSealByTarget(agent_id);
  if (!seal) {
    return { valid: false };
  }
  // Verify seal signature
  const sealData = `${seal.target_base_url}:${seal.conformance_report_hash}:${seal.issued_at}`;
  const sealHash = hash(canonicalizeBytes(sealData));
  const valid = await verify(sealHash, seal.signature, KERNEL_PUBLIC_KEY);
  return { valid, seal: valid ? seal : undefined };
};

// Middleware to enforce seal for clearing-grade operations
const requireSealMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const agent_id = req.body.agent_id || req.body.org_id;
  if (!agent_id) {
    return res.status(400).json({ error: 'Missing agent_id' });
  }

  const { valid } = await requireSeal(agent_id);
  if (!valid) {
    return res.status(403).json({
      error: 'SEAL REQUIRED',
      message: 'Clearing-grade operations require a valid Primordia Seal. Purchase a seal via /v1/seal/issue.',
      agent_id,
      seal_issue_url: '/v1/seal/issue'
    });
  }
  next();
};

// JSON Body Parser (with raw body for Stripe webhooks)
app.use(express.json({
  limit: '50mb', // Allow large batch requests
  verify: (req: any, res, buf) => {
    if (req.originalUrl === '/v1/stripe/webhook') {
      req.rawBody = buf;
    }
  }
}));

// ============================================================================
// FREE TIER ENDPOINTS (rate-limited, no credit required)
// ============================================================================

/**
 * GET /v1/spec
 * Returns the API specification
 */
app.get('/v1/spec', freeTierLimiter, (req: Request, res: Response) => {
  res.json({
    name: 'Primordia Clearing Kernel',
    version: '0.1.0',
    kernel_pubkey: KERNEL_PUBLIC_KEY,
    environment: process.env.NODE_ENV || 'development',
    test_mode: process.env.TEST_MODE === 'true',
    endpoints: {
      free_tier: [
        'GET /v1/spec',
        'POST /v1/verify',
        'POST /v1/seal/verify',
        'GET /healthz'
      ],
      paid_tier: [
        'POST /v1/net (402 → SIGNED IAN)',
        'POST /v1/net/batch',
        'POST /v1/index/batch',
        'POST /v1/credit/packs',
        'POST /v1/credit/create_intent',
        'POST /v1/credit/open',
        'POST /v1/credit/draw',
        'POST /v1/fc/commit',
        'POST /v1/default/trigger',
        'POST /v1/default/resolve ($25K)',
        'POST /v1/seal/issue ($1K)'
      ]
    },
    fees: {
      netting_fee_bps: NETTING_FEE_BPS,
      credit_spread_bps: CREDIT_SPREAD_BPS,
      seal_issuance_fee_usd: 1000,
      default_resolve_fee_usd: 25000
    },
    constraints: {
      clearing_grade_requires_seal: true,
      seal_verify_free: true,
      sdk_offline_verify_free: true
    }
  });
});

/**
 * POST /v1/verify
 * Verify signatures and receipts (FREE)
 */
app.post('/v1/verify', freeTierLimiter, async (req: Request, res: Response) => {
  const { type, payload }: VerifyRequest = req.body;

  if (!type || !payload) {
    return res.status(400).json({ error: 'Missing type or payload' });
  }

  let valid = false;
  let objHash = '';
  let details: any = {};

  try {
    const typeLower = type.toLowerCase();
    switch (typeLower) {
      case 'msr':
        // Support both wrapped MSR (with payload.payload + signatures) and raw MSR
        if (payload.payload && payload.signatures && Array.isArray(payload.signatures)) {
          // Wrapped MSR with signatures - verify each signature
          const payloadHash = hash(canonicalizeBytes(payload.payload));
          valid = true;

          for (const sig of payload.signatures) {
            if (!sig.agent_id || !sig.signature || !sig.pubkey) {
              valid = false;
              break;
            }
            const isValid = await verify(payloadHash, sig.signature, sig.pubkey);
            if (!isValid) {
              valid = false;
              break;
            }
          }

          objHash = payloadHash;
          details = { type: 'multi-signed-receipt', signature_count: payload.signatures.length };
        } else {
          // Raw MSR - just hash and validate structure
          objHash = hash(canonicalizeBytes(payload));
          valid = !!(payload.msr_version || payload.payer_agent_id || payload.payee_agent_id);
          details = { type: 'raw-receipt', valid_structure: valid };
        }
        break;

      case 'ian':
        const { signature_ed25519, ...ianWithoutSig } = payload;
        const ianHash = hash(canonicalizeBytes(ianWithoutSig));
        valid = await verify(ianHash, signature_ed25519, KERNEL_PUBLIC_KEY);
        objHash = ianHash;
        details = { type: 'inter-agent-netting', issued_by: 'clearing-kernel' };
        break;

      case 'fc':
        valid = !!(payload.certificate_hash && payload.conformance_level && payload.timestamp);
        objHash = hash(canonicalizeBytes(payload));
        details = { type: 'fidelity-certificate', conformance_level: payload.conformance_level };
        break;

      case 'seal':
        if (!payload.target_base_url || !payload.conformance_report_hash ||
            !payload.issued_at || !payload.signature) {
          return res.status(400).json({ error: 'Invalid seal structure' });
        }
        const sealData = `${payload.target_base_url}:${payload.conformance_report_hash}:${payload.issued_at}`;
        valid = await verify(hash(canonicalizeBytes(sealData)), payload.signature, KERNEL_PUBLIC_KEY);
        objHash = hash(canonicalizeBytes(payload));
        details = { type: 'conformance-seal', target: payload.target_base_url };
        break;

      default:
        return res.status(400).json({ error: `Unknown verification type: ${typeLower}` });
    }

    const response: VerifyResponse = { valid, hash: objHash, details };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: 'Verification failed',
      message: (error as Error).message
    });
  }
});

/**
 * POST /v1/seal/verify
 * Verify a conformance seal (FREE)
 */
app.post('/v1/seal/verify', freeTierLimiter, async (req: Request, res: Response) => {
  const { seal }: SealVerifyRequest = req.body;

  if (!seal) {
    return res.status(400).json({ error: 'Missing seal' });
  }

  if (!seal.target_base_url || !seal.conformance_report_hash ||
      !seal.issued_at || !seal.signature) {
    return res.status(400).json({ error: 'Invalid seal structure' });
  }

  const sealData = `${seal.target_base_url}:${seal.conformance_report_hash}:${seal.issued_at}`;
  const sealHash = hash(canonicalizeBytes(sealData));
  const valid = await verify(sealHash, seal.signature, KERNEL_PUBLIC_KEY);

  const response: SealVerifyResponse = {
    valid,
    details: valid ? {
      target: seal.target_base_url,
      issued_at: seal.issued_at,
      issued_by: seal.issued_by
    } : undefined
  };

  res.json(response);
});

/**
 * GET /healthz
 * Health check endpoint (FREE)
 */
app.get('/healthz', freeTierLimiter, async (req: Request, res: Response) => {
  const dbHealthy = await db.healthCheck();

  if (!dbHealthy) {
    return res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: Date.now()
    });
  }

  res.json({
    status: 'ok',
    database: 'connected',
    timestamp: Date.now(),
    kernel_pubkey: KERNEL_PUBLIC_KEY
  });
});

// ============================================================================
// FREE INDEXING (accelerates shadow accumulation → forces /v1/net later)
// ============================================================================

/**
 * POST /v1/index/batch
 * Index receipts for later netting (FREE - no credit required)
 * Purpose: accumulate receipts → force /v1/net (PAID) when ready to settle
 */
app.post('/v1/index/batch', freeTierLimiter, async (req: Request, res: Response) => {
  const { agent_id, receipts } = req.body;

  if (!agent_id || !receipts || !Array.isArray(receipts)) {
    return res.status(400).json({ error: 'Missing agent_id or receipts array' });
  }

  const indexed: string[] = [];
  const errors: any[] = [];

  for (const receipt of receipts) {
    try {
      const receiptHash = hash(canonicalizeBytes(receipt));

      // Store receipt in pending state (not yet netted)
      const receiptType = receipt.meter_version ? 'meter' : (receipt.type || 'msr');
      await db.storeReceipt(
        receiptHash,
        receiptType,
        receipt,
        agent_id,
        receipt.nonce,
        undefined  // request_hash = null means pending
      );

      indexed.push(receiptHash);
    } catch (error) {
      // Duplicate or other error - skip but track
      errors.push({
        receipt: receipt,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  res.json({
    indexed_count: indexed.length,
    indexed_hashes: indexed,
    errors: errors.length > 0 ? errors : undefined,
    message: indexed.length > 0
      ? `${indexed.length} receipts indexed. Call /v1/net to settle and receive SIGNED IAN (PAID).`
      : 'No new receipts indexed.',
    next_step: '/v1/net'
  });
});

// ============================================================================
// PAID TIER ENDPOINTS (require credit)
// ============================================================================

/**
 * POST /v1/net
 * Net multi-agent receipts (PAID - requires credit)
 */
app.post('/v1/net', async (req: Request, res: Response) => {
  const { agent_id, receipts, request_hash }: NettingRequest & { request_hash?: string } = req.body;

  if (!agent_id || !receipts || !Array.isArray(receipts)) {
    return res.status(400).json({ error: 'Missing agent_id or receipts array' });
  }

  // Calculate fee (netting_fee_bps on total receipt value)
  const totalValue = receipts.length * 1_000_000; // Assume $1 per receipt
  const feeAmount = Math.floor((totalValue * NETTING_FEE_BPS) / 10000);

  // Check credit
  const balance = await db.getBalance(agent_id);
  if (balance < feeAmount) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      message: 'Insufficient credit balance. Please purchase credit to continue.',
      required_usd_micros: feeAmount,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  // Compute input hash for idempotency
  const inputHash = request_hash || hash(canonicalizeBytes({ agent_id, receipts }));

  // Check for existing job (idempotency)
  const existingJob = await db.getNettingJob(inputHash);
  if (existingJob && existingJob.status === 'completed') {
    return res.json({
      ian_signed: existingJob.ian_payload,
      netting_hash: existingJob.ian_payload?.hash,
      fee_charged: existingJob.fee_charged_usd_micros,
      idempotent: true
    });
  }

  // Verify all receipts (skip in TEST_MODE)
  const skipSigVerify = process.env.TEST_MODE === 'true';

  if (!skipSigVerify) {
    for (const receipt of receipts) {
      if (!receipt.payload || !receipt.signatures || !Array.isArray(receipt.signatures)) {
        return res.status(400).json({ error: 'Invalid receipt structure' });
      }

      const payloadHash = hash(canonicalizeBytes(receipt.payload));
      for (const sig of receipt.signatures) {
        const isValid = await verify(payloadHash, sig.signature, sig.pubkey);
        if (!isValid) {
          return res.status(400).json({ error: 'Invalid receipt signature detected' });
        }
      }
    }
  }

  // Charge fee
  const deductResult = await db.deductCredit(agent_id, feeAmount, 'netting_fee', `net:${Date.now()}`);
  if (!deductResult.success) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      message: 'Failed to charge fee. Please ensure sufficient credit balance.',
      current_balance_usd_micros: deductResult.balance
    });
  }

  // Create netting job
  const job_id = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const receiptHashes = receipts.map(r => hash(canonicalizeBytes(r.payload || r)));
  await db.createNettingJob(job_id, agent_id, inputHash, receiptHashes);

  // Create IAN
  const timestamp = Date.now();
  const ianPayload = {
    agent_id,
    receipts: receiptHashes.sort(),
    net_amount: receipts.length,
    fee_charged_usd_micros: feeAmount,
    processed_at: timestamp,
    timestamp,
    issued_by: 'clearing-kernel'
  };

  const ianHash = hash(canonicalizeBytes(ianPayload));
  const ianSignature = await sign(ianHash, KERNEL_PRIVATE_KEY);

  const ian: MultiSignedReceipt = {
    payload: ianPayload,
    signatures: [{
      agent_id: 'clearing-kernel',
      signature: ianSignature,
      pubkey: KERNEL_PUBLIC_KEY
    }],
    timestamp,
    hash: ianHash
  };

  // Store IAN in database
  await db.storeReceipt(ianHash, 'ian', ian, 'clearing-kernel', undefined, inputHash);
  await db.completeNettingJob(job_id, ianHash, ian, feeAmount);

  const response: NettingResponse = {
    ian_signed: ian,
    netting_hash: ianHash,
    fee_charged: feeAmount
  };

  res.json(response);
});

/**
 * POST /v1/net/batch
 * Batch netting for high-volume (PAID)
 */
app.post('/v1/net/batch', async (req: Request, res: Response) => {
  const { agent_id, batches, request_hash } = req.body;

  if (!agent_id || !Array.isArray(batches)) {
    return res.status(400).json({ error: 'Missing agent_id or batches array' });
  }

  // Calculate total fee
  let totalReceipts = 0;
  for (const batch of batches) {
    totalReceipts += (batch.receipts?.length || 0);
  }

  const totalValue = totalReceipts * 1_000_000;
  const feeAmount = Math.floor((totalValue * NETTING_FEE_BPS) / 10000);

  // Check credit
  const balance = await db.getBalance(agent_id);
  if (balance < feeAmount) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      required_usd_micros: feeAmount,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  // Charge fee
  await db.deductCredit(agent_id, feeAmount, 'batch_netting_fee', `batch:${Date.now()}`);

  // Process each batch
  const results: any[] = [];
  for (const batch of batches) {
    const receipts = batch.receipts || [];
    const receiptHashes = receipts.map((r: any) => hash(canonicalizeBytes(r.payload || r)));

    const timestamp = Date.now();
    const ianPayload = {
      agent_id,
      batch_id: batch.batch_id,
      receipts: receiptHashes.sort(),
      net_amount: receipts.length,
      processed_at: timestamp,
      issued_by: 'clearing-kernel'
    };

    const ianHash = hash(canonicalizeBytes(ianPayload));
    const ianSignature = await sign(ianHash, KERNEL_PRIVATE_KEY);

    const ian = {
      payload: ianPayload,
      signatures: [{
        agent_id: 'clearing-kernel',
        signature: ianSignature,
        pubkey: KERNEL_PUBLIC_KEY
      }],
      timestamp,
      hash: ianHash
    };

    await db.storeReceipt(ianHash, 'ian', ian, 'clearing-kernel');

    results.push({
      batch_id: batch.batch_id,
      ian_signed: ian,
      receipt_count: receipts.length
    });
  }

  res.json({
    agent_id,
    total_receipts: totalReceipts,
    fee_charged: feeAmount,
    ians: results
  });
});

/**
 * POST /v1/index/batch
 * Submit 1000-10000 receipts in one call (PAID for storage, FREE for verify-only)
 */
app.post('/v1/index/batch', async (req: Request, res: Response) => {
  const { agent_id, org_id, receipts, request_hash } = req.body;
  const agentId = agent_id || org_id;

  if (!agentId || !Array.isArray(receipts)) {
    return res.status(400).json({ error: 'Missing agent_id/org_id or receipts array' });
  }

  if (receipts.length > 10000) {
    return res.status(400).json({ error: 'Maximum 10000 receipts per batch' });
  }

  // Prepare receipts for batch insert
  const toStore: Array<{
    receipt_hash: string;
    type: string;
    payload: any;
    issuer_agent_id: string;
    nonce?: string;
  }> = [];

  let rejected = 0;

  for (const receipt of receipts) {
    const receiptHash = hash(canonicalizeBytes(receipt));

    // Validate structure
    if (!receipt.msr_version || !receipt.payer_agent_id || !receipt.payee_agent_id) {
      rejected++;
      continue;
    }

    toStore.push({
      receipt_hash: receiptHash,
      type: 'msr',
      payload: receipt,
      issuer_agent_id: agentId,
      nonce: receipt.nonce
    });
  }

  // Batch insert
  const result = await db.storeReceiptsBatch(toStore);

  const batchId = `batch_${Date.now()}`;

  console.log(`[BATCH] agent=${agentId}: accepted=${result.accepted}, duplicate=${result.duplicate}, rejected=${rejected}`);

  res.json({
    org_id: agentId,
    batch_id: batchId,
    accepted: result.accepted,
    rejected: rejected + result.failed,
    duplicate: result.duplicate,
    request_hash: request_hash || hash(canonicalizeBytes({ agentId, receipts_count: receipts.length }))
  });
});

// MBS Query Fee
const MBS_QUERY_FEE_USD_MICROS = 100_000; // $0.10 per query

/**
 * POST /v1/mbs
 * Get Machine Balance Sheet (PAID - audit-grade, based on SIGNED IAN only)
 * Purpose: provide settlement-grade output that requires payment
 */
app.post('/v1/mbs', async (req: Request, res: Response) => {
  const { agent_id, as_of_epoch, include_pending } = req.body;

  if (!agent_id) {
    return res.status(400).json({ error: 'Missing agent_id' });
  }

  // Check credit - MBS is a PAID operation
  const balance = await db.getBalance(agent_id);
  if (balance < MBS_QUERY_FEE_USD_MICROS) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      message: 'Machine Balance Sheet requires credit. Audit-grade output is a PAID operation.',
      required_usd_micros: MBS_QUERY_FEE_USD_MICROS,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  // Check if agent has a valid seal (optional but noted)
  const { valid: hasValidSeal, seal } = await requireSeal(agent_id);

  // Deduct fee
  await db.deductCredit(agent_id, MBS_QUERY_FEE_USD_MICROS, 'mbs_query', `MBS query for ${agent_id}`);

  // Get all SIGNED IANs for this agent (kernel-signed truth only)
  const signedIANs = await db.getSignedIANsForAgent(agent_id, as_of_epoch);

  // Calculate net positions from signed IANs
  let total_receivable_usd_micros = 0;
  let total_payable_usd_micros = 0;
  const counterparty_positions: Record<string, number> = {};

  for (const ian of signedIANs) {
    const payload = ian.payload_json;
    if (payload.obligations) {
      for (const obligation of payload.obligations) {
        if (obligation.creditor_agent_id === agent_id) {
          total_receivable_usd_micros += obligation.amount_usd_micros || 0;
          counterparty_positions[obligation.debtor_agent_id] =
            (counterparty_positions[obligation.debtor_agent_id] || 0) + (obligation.amount_usd_micros || 0);
        } else if (obligation.debtor_agent_id === agent_id) {
          total_payable_usd_micros += obligation.amount_usd_micros || 0;
          counterparty_positions[obligation.creditor_agent_id] =
            (counterparty_positions[obligation.creditor_agent_id] || 0) - (obligation.amount_usd_micros || 0);
        }
      }
    }
  }

  // Get pending receipts count (not yet netted)
  const pendingCount = include_pending ? await db.getPendingReceiptsCount(agent_id) : 0;

  // Create MBS
  const mbs = {
    mbs_version: '0.1',
    agent_id,
    as_of_epoch: as_of_epoch || 'current',
    generated_at: Date.now(),
    kernel_signature: '',

    // Audit-grade positions (based on SIGNED IAN only)
    audit_grade: {
      total_receivable_usd_micros,
      total_payable_usd_micros,
      net_position_usd_micros: total_receivable_usd_micros - total_payable_usd_micros,
      signed_ian_count: signedIANs.length,
      counterparty_positions
    },

    // Pending (not audit-grade, just informational)
    pending: include_pending ? {
      pending_receipt_count: pendingCount,
      message: 'Pending receipts are NOT audit-grade. Call /v1/net to settle.'
    } : undefined,

    // Seal status
    seal_status: hasValidSeal ? {
      sealed: true,
      seal_id: seal?.seal_id,
      issued_at: seal?.issued_at
    } : {
      sealed: false,
      message: 'Agent does not have a valid seal. Some operations may be restricted.'
    },

    // Fee charged
    query_fee_charged_usd_micros: MBS_QUERY_FEE_USD_MICROS
  };

  // Sign the MBS
  const mbsHash = hash(canonicalizeBytes(mbs));
  const signature = await sign(mbsHash, KERNEL_PRIVATE_KEY);
  mbs.kernel_signature = signature;

  res.json(mbs);
});

/**
 * POST /v1/mbs/export
 * Export MBS as CSV or JSON (PAID - audit-grade)
 */
app.post('/v1/mbs/export', async (req: Request, res: Response) => {
  const { agent_id, format } = req.body;

  if (!agent_id) {
    return res.status(400).json({ error: 'Missing agent_id' });
  }

  const balance = await db.getBalance(agent_id);
  if (balance < MBS_QUERY_FEE_USD_MICROS) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      required_usd_micros: MBS_QUERY_FEE_USD_MICROS,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  await db.deductCredit(agent_id, MBS_QUERY_FEE_USD_MICROS, 'mbs_export', `MBS export for ${agent_id}`);

  const signedIANs = await db.getSignedIANsForAgent(agent_id);

  if (format === 'csv') {
    let csv = 'ian_hash,counterparty,direction,amount_usd,timestamp\n';
    for (const ian of signedIANs) {
      const payload = ian.payload_json;
      if (payload.obligations) {
        for (const ob of payload.obligations) {
          const direction = ob.creditor_agent_id === agent_id ? 'receivable' : 'payable';
          const counterparty = ob.creditor_agent_id === agent_id ? ob.debtor_agent_id : ob.creditor_agent_id;
          csv += `${ian.receipt_hash},${counterparty},${direction},${(ob.amount_usd_micros || 0) / 1000000},${ian.created_at}\n`;
        }
      }
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="mbs_${agent_id}.csv"`);
    return res.send(csv);
  }

  res.json({ agent_id, signed_ians: signedIANs, export_format: 'json', generated_at: Date.now() });
});

/**
 * POST /v1/credit/packs
 * Get available credit packs
 */
app.post('/v1/credit/packs', (req: Request, res: Response) => {
  const packs = [
    { pack_id: 'pack_dev', credits_usd_micros: 1_000_000_000, price_usd: 1000, description: 'Developer ($1K)' },
    { pack_id: 'pack_dev_plus', credits_usd_micros: 5_000_000_000, price_usd: 5000, description: 'Developer Plus ($5K)' },
    { pack_id: 'pack_team', credits_usd_micros: 25_000_000_000, price_usd: 25000, description: 'Team ($25K)' },
    { pack_id: 'pack_100k', credits_usd_micros: 100_000_000_000, price_usd: 100000, description: 'Startup ($100K)' },
    { pack_id: 'pack_250k', credits_usd_micros: 250_000_000_000, price_usd: 250000, description: 'Scale ($250K)' },
    { pack_id: 'pack_1m', credits_usd_micros: 1_000_000_000_000, price_usd: 1000000, description: 'Enterprise ($1M)' }
  ];
  res.json({ packs, pay_url: 'https://kaledge.app/primordia/pay', stripe_enabled: !!stripeService });
});

/**
 * POST /v1/admin/credit/apply
 * ADMIN-ONLY: Manually apply credit after invoice payment
 */
app.post('/v1/admin/credit/apply', requireAdmin, async (req: Request, res: Response) => {
  const { agent_id, pack_id, credits_usd_micros, invoice_ref } = req.body;

  if (!agent_id) {
    return res.status(400).json({ error: 'Missing agent_id' });
  }

  // Determine credits amount
  let credits = credits_usd_micros;
  if (pack_id) {
    const packCredits: Record<string, number> = {
      'pack_dev': 1_000_000_000,
      'pack_dev_plus': 5_000_000_000,
      'pack_team': 25_000_000_000,
      'pack_100k': 100_000_000_000,
      'pack_250k': 250_000_000_000,
      'pack_1m': 1_000_000_000_000
    };
    credits = packCredits[pack_id] || credits;
  }

  if (!credits || credits <= 0) {
    return res.status(400).json({ error: 'Missing or invalid credits amount' });
  }

  try {
    await db.addCredit(agent_id, credits, 'admin_apply', invoice_ref || 'manual');
    const newBalance = await db.getBalance(agent_id);

    res.json({
      success: true,
      agent_id,
      credits_applied_usd_micros: credits,
      new_balance_usd_micros: newBalance,
      invoice_ref: invoice_ref || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to apply credit', message: (error as Error).message });
  }
});

/**
 * POST /v1/credit/create_intent
 * Create a Stripe checkout session (PAID)
 */
app.post('/v1/credit/create_intent', async (req: Request, res: Response) => {
  if (!stripeService) {
    return res.status(503).json({ error: 'Payment service not configured' });
  }

  const { pack_id, agent_id }: CreateIntentRequest = req.body;

  if (!pack_id || !agent_id) {
    return res.status(400).json({ error: 'Missing pack_id or agent_id' });
  }

  try {
    const { url, session_id } = await stripeService.createCheckoutSession(pack_id, agent_id);

    const response: CreateIntentResponse = {
      checkout_url: url,
      session_id
    };

    res.json(response);
  } catch (error) {
    res.status(400).json({
      error: 'Failed to create checkout session',
      message: (error as Error).message
    });
  }
});

/**
 * POST /v1/stripe/webhook
 * Handle Stripe webhook events
 */
app.post('/v1/stripe/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  if (!stripeService) {
    return res.status(503).json({ error: 'Payment service not configured' });
  }

  const signature = req.headers['stripe-signature'] as string;
  const rawBody = (req as any).rawBody;

  if (!signature || !rawBody) {
    return res.status(400).json({ error: 'Missing signature or body' });
  }

  try {
    const event = stripeService.verifyWebhook(rawBody, signature);

    const purchase = stripeService.extractCreditPurchase(event);
    if (purchase) {
      await db.addCredit(
        purchase.agent_id,
        purchase.amount_usd_micros,
        'stripe_purchase',
        `stripe:${purchase.session_id}`
      );

      console.log(`[Credit] Added: ${purchase.agent_id} +${purchase.amount_usd_micros} micros`);
    }

    res.json({ received: true, event_type: event.type });
  } catch (error) {
    console.error('[Webhook] Error:', (error as Error).message);
    res.status(400).json({
      error: 'Webhook verification failed',
      message: (error as Error).message
    });
  }
});

/**
 * POST /v1/credit/open
 * Open a credit line backed by MBS (PAID)
 */
app.post('/v1/credit/open', requireCredit(1_000_000), async (req: Request, res: Response) => {
  const { agent_id, mbs, limit_usd_micros, terms_hash }: CreditLineOpenRequest = req.body;

  if (!agent_id || !mbs || !limit_usd_micros || !terms_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const credit_line_id = `cl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.openCreditLine(credit_line_id, agent_id, mbs, limit_usd_micros, terms_hash);

  const response: CreditLineOpenResponse = { credit_line_id };
  res.json(response);
});

/**
 * POST /v1/credit/draw
 * Draw from a credit line (PAID)
 */
app.post('/v1/credit/draw', async (req: Request, res: Response) => {
  const { credit_line_id, amount_usd_micros }: CreditDrawRequest = req.body;

  if (!credit_line_id || !amount_usd_micros) {
    return res.status(400).json({ error: 'Missing credit_line_id or amount_usd_micros' });
  }

  const draw_id = `draw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const result = await db.drawFromCreditLine(credit_line_id, amount_usd_micros, draw_id);

  if (!result.success) {
    return res.status(400).json({
      error: 'Failed to draw from credit line. Check limit and availability.'
    });
  }

  // Create MSR for the draw
  const drawData = {
    draw_id,
    credit_line_id,
    amount_usd_micros,
    drawn_at: Date.now()
  };

  const drawHash = hash(canonicalizeBytes(drawData));
  const signature = await sign(drawHash, KERNEL_PRIVATE_KEY);

  const msr: MultiSignedReceipt = {
    payload: drawData,
    signatures: [{
      agent_id: 'clearing-kernel',
      signature,
      pubkey: KERNEL_PUBLIC_KEY
    }],
    timestamp: Date.now(),
    hash: drawHash
  };

  await db.storeReceipt(drawHash, 'msr', msr, 'clearing-kernel');

  const response: CreditDrawResponse = { draw_id, msr };
  res.json(response);
});

/**
 * POST /v1/fc/commit
 * Commit a Fidelity Certificate (PAID)
 */
app.post('/v1/fc/commit', requireCredit(100_000), async (req: Request, res: Response) => {
  const { agent_id, fc }: FidelityCertificateCommitRequest = req.body;

  if (!agent_id || !fc) {
    return res.status(400).json({ error: 'Missing agent_id or fc' });
  }

  const commitment_id = `fc_commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Store FC
  const fcHash = hash(canonicalizeBytes(fc));
  await db.storeReceipt(fcHash, 'fc', fc, agent_id);

  const response: FidelityCertificateCommitResponse = { commitment_id };
  res.json(response);
});

/**
 * POST /v1/default/trigger
 * Trigger a default case (PAID)
 */
app.post('/v1/default/trigger', requireCredit(1_000_000), async (req: Request, res: Response) => {
  const { agent_id, reason_code }: DefaultTriggerRequest = req.body;

  if (!agent_id || !reason_code) {
    return res.status(400).json({ error: 'Missing agent_id or reason_code' });
  }

  const default_id = `def_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.triggerDefault(default_id, agent_id, reason_code);

  const response: DefaultTriggerResponse = {
    default_id,
    triggered_at: Date.now()
  };

  res.json(response);
});

/**
 * POST /v1/default/resolve
 * Resolve a default case (PAID - $25,000 fee)
 */
app.post('/v1/default/resolve', async (req: Request, res: Response) => {
  const { default_id, action, params, agent_id }: DefaultResolveRequest & { agent_id: string } = req.body;

  if (!default_id || !action || !agent_id) {
    return res.status(400).json({ error: 'Missing default_id, action, or agent_id' });
  }

  // Charge $25,000 resolution fee
  const balance = await db.getBalance(agent_id);
  if (balance < DEFAULT_RESOLVE_FEE_USD_MICROS) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      message: 'Default resolution requires $25,000 fee.',
      required_usd_micros: DEFAULT_RESOLVE_FEE_USD_MICROS,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  await db.deductCredit(agent_id, DEFAULT_RESOLVE_FEE_USD_MICROS, 'default_resolve_fee', `resolve:${default_id}`);

  const resolution_receipt_id = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const resolved = await db.resolveDefault(default_id, action, params, resolution_receipt_id);

  if (!resolved) {
    // Refund fee if resolution failed
    await db.addCredit(agent_id, DEFAULT_RESOLVE_FEE_USD_MICROS, 'default_resolve_refund', `refund:${default_id}`);
    return res.status(400).json({
      error: 'Failed to resolve default. Check if default exists and is not already resolved.'
    });
  }

  const response: DefaultResolveResponse = { resolution_receipt_id };
  res.json(response);
});

// Seal issuance fee: $1000 in micros
const SEAL_ISSUANCE_FEE_USD_MICROS = 1_000_000_000;

/**
 * POST /v1/seal/issue
 * Issue a conformance seal (SELF-SERVE PAID via 402)
 */
app.post('/v1/seal/issue', async (req: Request, res: Response) => {
  const { agent_id, target_base_url, conformance_report_hash }: SealIssueRequest & { agent_id: string } = req.body;

  if (!agent_id || !target_base_url || !conformance_report_hash) {
    return res.status(400).json({ error: 'Missing agent_id, target_base_url, or conformance_report_hash' });
  }

  // Check credit (seal issuance costs $1000)
  const balance = await db.getBalance(agent_id);
  if (balance < SEAL_ISSUANCE_FEE_USD_MICROS) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      message: 'Seal issuance requires $1,000 fee.',
      required_usd_micros: SEAL_ISSUANCE_FEE_USD_MICROS,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  // Charge fee
  await db.deductCredit(agent_id, SEAL_ISSUANCE_FEE_USD_MICROS, 'seal_issuance_fee', `seal:${target_base_url}`);

  const issued_at = Date.now();
  const sealData = `${target_base_url}:${conformance_report_hash}:${issued_at}`;
  const sealHash = hash(canonicalizeBytes(sealData));
  const signature = await sign(sealHash, KERNEL_PRIVATE_KEY);

  const seal = {
    target_base_url,
    conformance_report_hash,
    issued_at,
    issued_by: 'clearing-kernel',
    signature
  };

  const seal_id = `seal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.storeSeal(seal_id, target_base_url, conformance_report_hash, seal, sealHash, 'clearing-kernel');

  const response: SealIssueResponse = { seal };
  res.json(response);
});

/**
 * GET /v1/credit/balance
 * Get agent credit balance
 */
app.get('/v1/credit/balance', async (req: Request, res: Response) => {
  const agent_id = req.query.agent_id as string || req.query.org_id as string;

  if (!agent_id) {
    return res.status(400).json({ error: 'Missing agent_id query parameter' });
  }

  const balance = await db.getBalance(agent_id);

  res.json({
    agent_id,
    balance_usd_micros: balance
  });
});

/**
 * GET /v1/metrics
 * Get system metrics
 */
app.get('/v1/metrics', async (req: Request, res: Response) => {
  const metrics = await db.getMetrics();

  res.json({
    ...metrics,
    total_credits_usd: metrics.total_credits_usd_micros / 1_000_000,
    total_netting_volume_usd: metrics.total_netting_volume_usd_micros / 1_000_000
  });
});

// ============================================================================
// CREDIT RAIL (RAIL-2) - All endpoints require seal + credit
// ============================================================================

// Initialize Credit Service
let creditService: CreditService | null = null;
// Will be initialized after KERNEL_PRIVATE_KEY is set

const initCreditService = () => {
  if (!creditService && KERNEL_PRIVATE_KEY && KERNEL_PUBLIC_KEY) {
    creditService = new CreditService(KERNEL_PRIVATE_KEY, KERNEL_PUBLIC_KEY);
  }
  return creditService;
};

// Credit operation fee constants
const CREDIT_OP_FEES: Record<string, number> = {
  line_open_min: 50_000_000,      // $50 minimum
  line_update: 10_000_000,        // $10
  draw_min: 10_000_000,           // $10 minimum
  interest_accrue: 1_000_000,     // $1
  fee_apply: 1_000_000,           // $1
  margin_call: 100_000_000,       // $100
  collateral_lock: 10_000_000,    // $10
  collateral_unlock: 10_000_000,  // $10
  liquidate_min: 100_000_000,     // $100 minimum
};

/**
 * POST /v1/credit/line/open
 * Open a new credit line (PAID + SEAL required)
 */
app.post('/v1/credit/line/open', async (req: Request, res: Response) => {
  const { borrower_agent_id, lender_agent_id, limit_usd_micros, spread_bps, maturity_ts, request_hash } = req.body;

  if (!borrower_agent_id || !lender_agent_id || !limit_usd_micros || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Require seal
  const { valid: hasSeal } = await requireSeal(borrower_agent_id);
  if (!hasSeal) {
    return res.status(403).json({
      error: 'SEAL REQUIRED',
      message: 'Credit operations require a valid Primordia Seal.',
      seal_issue_url: '/v1/seal/issue'
    });
  }

  // Calculate fee (0.5% of limit, min $50)
  const fee = Math.max(Math.floor(limit_usd_micros * 50 / 10000), CREDIT_OP_FEES.line_open_min);

  // Check credit
  const balance = await db.getBalance(borrower_agent_id);
  if (balance < fee) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      message: 'Insufficient credit for credit line opening fee.',
      required_usd_micros: fee,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.openLine({
      borrower_agent_id,
      lender_agent_id,
      limit_usd_micros,
      spread_bps,
      maturity_ts,
      request_hash
    });

    // Deduct fee
    if (result.fee_charged > 0) {
      await db.deductCredit(borrower_agent_id, fee, 'credit_line_open', result.receipt.credit_line_id);
    }

    res.json({
      receipt: result.receipt,
      position: result.position,
      fee_charged_usd_micros: fee
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Credit line open failed' });
  }
});

/**
 * POST /v1/credit/draw
 * Draw from credit line (PAID + SEAL required)
 */
app.post('/v1/credit/draw', async (req: Request, res: Response) => {
  const { credit_line_id, agent_id, amount_usd_micros, request_hash } = req.body;

  if (!credit_line_id || !agent_id || !amount_usd_micros || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { valid: hasSeal } = await requireSeal(agent_id);
  if (!hasSeal) {
    return res.status(403).json({
      error: 'SEAL REQUIRED',
      message: 'Credit operations require a valid Primordia Seal.',
      seal_issue_url: '/v1/seal/issue'
    });
  }

  const fee = Math.max(Math.floor(amount_usd_micros * 10 / 10000), CREDIT_OP_FEES.draw_min);
  const balance = await db.getBalance(agent_id);
  if (balance < fee) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      required_usd_micros: fee,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.draw({ credit_line_id, agent_id, amount_usd_micros, request_hash });
    if (result.fee_charged > 0) {
      await db.deductCredit(agent_id, fee, 'credit_draw', credit_line_id);
    }

    res.json({
      receipt: result.receipt,
      position: result.position,
      fee_charged_usd_micros: fee
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Draw failed' });
  }
});

/**
 * POST /v1/credit/repay
 * Repay credit (SEAL required, no fee)
 */
app.post('/v1/credit/repay', async (req: Request, res: Response) => {
  const { credit_line_id, agent_id, principal_usd_micros, interest_usd_micros, fees_usd_micros, request_hash } = req.body;

  if (!credit_line_id || !agent_id || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { valid: hasSeal } = await requireSeal(agent_id);
  if (!hasSeal) {
    return res.status(403).json({
      error: 'SEAL REQUIRED',
      message: 'Credit operations require a valid Primordia Seal.',
      seal_issue_url: '/v1/seal/issue'
    });
  }

  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.repay({ credit_line_id, agent_id, principal_usd_micros, interest_usd_micros, fees_usd_micros, request_hash });

    res.json({
      receipt: result.receipt,
      position: result.position,
      fee_charged_usd_micros: 0
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Repay failed' });
  }
});

/**
 * POST /v1/credit/interest/accrue
 * Accrue interest on credit line (PAID + SEAL required)
 */
app.post('/v1/credit/interest/accrue', async (req: Request, res: Response) => {
  const { credit_line_id, agent_id, window_id, days, request_hash } = req.body;

  if (!credit_line_id || !agent_id || !window_id || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { valid: hasSeal } = await requireSeal(agent_id);
  if (!hasSeal) {
    return res.status(403).json({
      error: 'SEAL REQUIRED',
      seal_issue_url: '/v1/seal/issue'
    });
  }

  const fee = CREDIT_OP_FEES.interest_accrue;
  const balance = await db.getBalance(agent_id);
  if (balance < fee) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      required_usd_micros: fee,
      current_balance_usd_micros: balance,
      purchase_url: '/v1/credit/packs'
    });
  }

  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.accrueInterest({ credit_line_id, agent_id, window_id, days, request_hash });
    await db.deductCredit(agent_id, fee, 'interest_accrue', credit_line_id);

    res.json({
      receipt: result.receipt,
      position: result.position,
      fee_charged_usd_micros: fee
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Interest accrual failed' });
  }
});

/**
 * POST /v1/credit/fee/apply
 * Apply fee to credit line (PAID + SEAL required)
 */
app.post('/v1/credit/fee/apply', async (req: Request, res: Response) => {
  const { credit_line_id, agent_id, fee_type, amount_usd_micros, reason, request_hash } = req.body;

  if (!credit_line_id || !agent_id || !fee_type || !amount_usd_micros || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { valid: hasSeal } = await requireSeal(agent_id);
  if (!hasSeal) {
    return res.status(403).json({ error: 'SEAL REQUIRED', seal_issue_url: '/v1/seal/issue' });
  }

  const opFee = CREDIT_OP_FEES.fee_apply;
  const balance = await db.getBalance(agent_id);
  if (balance < opFee) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      required_usd_micros: opFee,
      purchase_url: '/v1/credit/packs'
    });
  }

  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.applyFee({ credit_line_id, agent_id, fee_type, amount_usd_micros, reason, request_hash });
    await db.deductCredit(agent_id, opFee, 'fee_apply', credit_line_id);

    res.json({ receipt: result.receipt, position: result.position, fee_charged_usd_micros: opFee });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Fee apply failed' });
  }
});

/**
 * POST /v1/credit/margin/call
 * Trigger/resolve margin call (PAID + SEAL required)
 */
app.post('/v1/credit/margin/call', async (req: Request, res: Response) => {
  const { credit_line_id, agent_id, action, reason, required_usd_micros, due_ts, margin_call_id, request_hash } = req.body;

  if (!credit_line_id || !agent_id || !action || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { valid: hasSeal } = await requireSeal(agent_id);
  if (!hasSeal) {
    return res.status(403).json({ error: 'SEAL REQUIRED', seal_issue_url: '/v1/seal/issue' });
  }

  const fee = CREDIT_OP_FEES.margin_call;
  const balance = await db.getBalance(agent_id);
  if (balance < fee) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      required_usd_micros: fee,
      purchase_url: '/v1/credit/packs'
    });
  }

  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.marginCall({ credit_line_id, agent_id, action, reason, required_usd_micros, due_ts, margin_call_id, request_hash });
    await db.deductCredit(agent_id, fee, 'margin_call', credit_line_id);

    res.json({ receipt: result.receipt, position: result.position, fee_charged_usd_micros: fee });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Margin call failed' });
  }
});

/**
 * POST /v1/credit/collateral/lock
 * Lock collateral (PAID + SEAL required)
 */
app.post('/v1/credit/collateral/lock', async (req: Request, res: Response) => {
  const { credit_line_id, agent_id, asset_ref, asset_type, amount_usd_micros, request_hash } = req.body;

  if (!credit_line_id || !agent_id || !asset_ref || !asset_type || !amount_usd_micros || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { valid: hasSeal } = await requireSeal(agent_id);
  if (!hasSeal) {
    return res.status(403).json({ error: 'SEAL REQUIRED', seal_issue_url: '/v1/seal/issue' });
  }

  const fee = CREDIT_OP_FEES.collateral_lock;
  const balance = await db.getBalance(agent_id);
  if (balance < fee) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      required_usd_micros: fee,
      purchase_url: '/v1/credit/packs'
    });
  }

  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.lockCollateral({ credit_line_id, agent_id, action: 'lock', asset_ref, asset_type, amount_usd_micros, request_hash });
    await db.deductCredit(agent_id, fee, 'collateral_lock', credit_line_id);

    res.json({ receipt: result.receipt, position: result.position, fee_charged_usd_micros: fee });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Collateral lock failed' });
  }
});

/**
 * POST /v1/credit/collateral/unlock
 * Unlock collateral (PAID + SEAL required)
 */
app.post('/v1/credit/collateral/unlock', async (req: Request, res: Response) => {
  const { credit_line_id, agent_id, collateral_lock_id, request_hash } = req.body;

  if (!credit_line_id || !agent_id || !collateral_lock_id || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { valid: hasSeal } = await requireSeal(agent_id);
  if (!hasSeal) {
    return res.status(403).json({ error: 'SEAL REQUIRED', seal_issue_url: '/v1/seal/issue' });
  }

  const fee = CREDIT_OP_FEES.collateral_unlock;
  const balance = await db.getBalance(agent_id);
  if (balance < fee) {
    return res.status(402).json({
      error: 'BOOKS OPEN — CREDIT REQUIRED',
      required_usd_micros: fee,
      purchase_url: '/v1/credit/packs'
    });
  }

  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.unlockCollateral({ credit_line_id, agent_id, action: 'unlock', asset_ref: '', asset_type: 'external', amount_usd_micros: 0, collateral_lock_id, request_hash });
    await db.deductCredit(agent_id, fee, 'collateral_unlock', credit_line_id);

    res.json({ receipt: result.receipt, position: result.position, fee_charged_usd_micros: fee });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Collateral unlock failed' });
  }
});

/**
 * POST /v1/credit/liquidate
 * Liquidate position (PAID + SEAL required)
 */
app.post('/v1/credit/liquidate', async (req: Request, res: Response) => {
  const { credit_line_id, agent_id, margin_call_id, request_hash } = req.body;

  if (!credit_line_id || !agent_id || !margin_call_id || !request_hash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { valid: hasSeal } = await requireSeal(agent_id);
  if (!hasSeal) {
    return res.status(403).json({ error: 'SEAL REQUIRED', seal_issue_url: '/v1/seal/issue' });
  }

  // Liquidation fee calculated on result
  try {
    const cs = initCreditService();
    if (!cs) throw new Error('Credit service not initialized');

    const result = await cs.liquidate({ credit_line_id, agent_id, margin_call_id, request_hash });
    // Fee already deducted from collateral in liquidation

    res.json({ receipt: result.receipt, position: result.position, fee_charged_usd_micros: result.fee_charged });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Liquidation failed' });
  }
});

// ============================================================================
// Test Endpoints (Development Only)
// ============================================================================

/**
 * POST /v1/test/credit_grant
 * Grant credit for testing (TEST_MODE only)
 */
app.post('/v1/test/credit_grant', async (req: Request, res: Response) => {
  // STRICT: Only enabled when TEST_MODE=true (never in production)
  if (process.env.TEST_MODE !== 'true') {
    return res.status(403).json({
      error: 'Test endpoints disabled',
      message: 'Credit must be purchased via /v1/credit/packs in production.',
      purchase_url: '/v1/credit/packs'
    });
  }

  const { org_id, agent_id, amount_usd_micros } = req.body;
  const agentId = org_id || agent_id;

  if (!agentId || !amount_usd_micros) {
    return res.status(400).json({ error: 'Missing org_id/agent_id or amount_usd_micros' });
  }

  const balance = await db.addCredit(agentId, amount_usd_micros, 'test_grant', `test:${Date.now()}`);

  console.log(`[TEST] Credit granted: agent=${agentId}, amount=${amount_usd_micros} micros`);

  res.json({
    agent_id: agentId,
    amount_granted_usd_micros: amount_usd_micros,
    balance_usd_micros: balance
  });
});

// ============================================================================
// Error Handling
// ============================================================================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Server] Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ============================================================================
// Register ALR Endpoints (Enterprise)
registerALREndpoints(app, KERNEL_PRIVATE_KEY, KERNEL_PUBLIC_KEY);

// 404 Handler (must be last)
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start Server

// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           PRIMORDIA CLEARING KERNEL v0.1.0                    ║
║           Multi-Agent Settlement Infrastructure               ║
║           PostgreSQL Persistence: ENABLED                     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

Server listening on port ${PORT}
Kernel Public Key: ${KERNEL_PUBLIC_KEY}

Configuration:
  - Netting Fee: ${NETTING_FEE_BPS} bps
  - Credit Spread: ${CREDIT_SPREAD_BPS} bps
  - Free Tier Rate Limit: ${FREE_TIER_RATE_LIMIT} req/${FREE_TIER_WINDOW_MS}ms
  - Default Resolve Fee: $25,000

Free Tier (rate-limited):
  GET  /v1/spec
  POST /v1/verify
  POST /v1/seal/verify
  GET  /healthz

Paid Tier (credit required):
  POST /v1/net
  POST /v1/net/batch
  POST /v1/index/batch
  POST /v1/credit/*
  POST /v1/fc/commit
  POST /v1/default/*
  POST /v1/seal/issue (admin)

Ready to process transactions.
  `);
});

export { app };
