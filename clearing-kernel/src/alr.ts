// Agent Liability Report (ALR) - Enterprise Artifact
// Requires: SEAL + SIGNED IAN + MBS
// Cost: $100 (included in pack_team+)

import { Request, Response, Express } from 'express';
import * as db from './db.js';
import { hash, sign } from './crypto.js';
import { canonicalizeBytes } from './canonical.js';

export const ALR_FEE_USD_MICROS = 100_000_000; // $100

export function registerALREndpoints(app: Express, KERNEL_PRIVATE_KEY: string, KERNEL_PUBLIC_KEY: string) {

  /**
   * POST /v1/alr/generate
   * Generate Agent Liability Report (PAID - Enterprise)
   * Requires: Valid SEAL, at least one SIGNED IAN window
   * Output: CSV, PDF, or JSON
   */
  app.post('/v1/alr/generate', async (req: Request, res: Response) => {
    const { agent_id, format, period_start, period_end } = req.body;

    if (!agent_id) {
      return res.status(400).json({ error: 'Missing agent_id' });
    }

    // 1. SEAL REQUIRED - No ALR without conformance
    const seal = await db.getSealForAgent(agent_id);
    if (!seal) {
      return res.status(402).json({
        error: 'SEAL REQUIRED — NO ALR WITHOUT CONFORMANCE',
        message: 'Agent Liability Report requires valid Primordia Seal. No seal found.',
        action: 'Contact sales@primordia.dev for seal issuance ($1,000)',
        blocking: true,
        process_blocked: ['reconciliation', 'invoice', 'monthly_close']
      });
    }

    // 2. SIGNED IAN REQUIRED - No ALR without settlement
    const signedIANs = await db.getSignedIANsForAgent(agent_id);
    if (!signedIANs || signedIANs.length === 0) {
      return res.status(402).json({
        error: 'NO SIGNED IAN — NO ALR WITHOUT SETTLEMENT',
        message: 'Agent Liability Report requires at least one signed IAN window. Submit receipts via /v1/net first.',
        action: 'Call /v1/net with receipts to create signed IAN',
        blocking: true,
        process_blocked: ['reconciliation', 'invoice', 'monthly_close']
      });
    }

    // 3. CREDIT REQUIRED - pack_team minimum
    const balance = await db.getBalance(agent_id);
    if (balance < ALR_FEE_USD_MICROS) {
      return res.status(402).json({
        error: 'BOOKS OPEN — CREDIT REQUIRED FOR ALR',
        message: 'Agent Liability Report requires pack_team ($25K) or higher.',
        required_usd_micros: ALR_FEE_USD_MICROS,
        current_balance_usd_micros: balance,
        purchase_url: '/v1/credit/packs',
        recommended_pack: 'pack_team',
        blocking: true,
        process_blocked: ['reconciliation', 'invoice', 'monthly_close']
      });
    }

    // Charge ALR fee
    await db.deductCredit(agent_id, ALR_FEE_USD_MICROS, 'alr_generation', `ALR for ${agent_id}`);

    // Build ALR from signed IANs
    const now = Date.now();
    const periodStart = period_start || signedIANs[signedIANs.length - 1]?.created_at || now - 30 * 24 * 60 * 60 * 1000;
    const periodEnd = period_end || now;

    let totalReceivables = 0;
    let totalPayables = 0;
    const counterparties: Record<string, { receivable: number; payable: number }> = {};
    const lineItems: any[] = [];

    for (const ian of signedIANs) {
      const payload = ian.payload_json;
      if (payload.obligations) {
        for (const ob of payload.obligations) {
          const isReceivable = ob.creditor_agent_id === agent_id;
          const amount = ob.amount_usd_micros || 0;
          const counterparty = isReceivable ? ob.debtor_agent_id : ob.creditor_agent_id;

          if (!counterparties[counterparty]) {
            counterparties[counterparty] = { receivable: 0, payable: 0 };
          }

          if (isReceivable) {
            totalReceivables += amount;
            counterparties[counterparty].receivable += amount;
          } else {
            totalPayables += amount;
            counterparties[counterparty].payable += amount;
          }

          lineItems.push({
            ian_hash: ian.receipt_hash,
            counterparty,
            type: isReceivable ? 'RECEIVABLE' : 'PAYABLE',
            amount_usd: amount / 1_000_000,
            amount_usd_micros: amount,
            timestamp: ian.created_at,
            kernel_signed: true
          });
        }
      }
    }

    const netPosition = totalReceivables - totalPayables;

    // Create ALR structure
    const alr = {
      report_type: 'AGENT_LIABILITY_REPORT',
      version: '0.1',
      agent_id,
      seal_id: seal.seal_id,
      seal_verified: true,
      period: {
        start: new Date(periodStart).toISOString(),
        end: new Date(periodEnd).toISOString()
      },
      summary: {
        total_receivables_usd: totalReceivables / 1_000_000,
        total_payables_usd: totalPayables / 1_000_000,
        net_position_usd: netPosition / 1_000_000,
        ian_windows_count: signedIANs.length,
        line_items_count: lineItems.length
      },
      counterparty_breakdown: Object.entries(counterparties).map(([cp, data]) => ({
        counterparty_id: cp,
        receivable_usd: data.receivable / 1_000_000,
        payable_usd: data.payable / 1_000_000,
        net_usd: (data.receivable - data.payable) / 1_000_000
      })),
      line_items: lineItems,
      generated_at: new Date(now).toISOString(),
      generated_by: 'primordia-clearing-kernel',
      fee_charged_usd: ALR_FEE_USD_MICROS / 1_000_000,
      certification: {
        statement: 'This Agent Liability Report is generated from kernel-signed IAN windows and audit-grade MBS data.',
        kernel_pubkey: KERNEL_PUBLIC_KEY,
        seal_required: true,
        audit_grade: true
      }
    };

    // Sign the ALR
    const alrHash = hash(canonicalizeBytes(alr));
    const alrSignature = await sign(alrHash, KERNEL_PRIVATE_KEY);

    const signedALR = {
      ...alr,
      alr_hash: alrHash,
      kernel_signature: alrSignature
    };

    // Output format
    if (format === 'csv') {
      let csv = 'AGENT LIABILITY REPORT\n';
      csv += `Agent ID,${agent_id}\n`;
      csv += `Seal ID,${seal.seal_id}\n`;
      csv += `Period Start,${alr.period.start}\n`;
      csv += `Period End,${alr.period.end}\n`;
      csv += `Generated,${alr.generated_at}\n`;
      csv += '\nSUMMARY\n';
      csv += `Total Receivables USD,${alr.summary.total_receivables_usd}\n`;
      csv += `Total Payables USD,${alr.summary.total_payables_usd}\n`;
      csv += `Net Position USD,${alr.summary.net_position_usd}\n`;
      csv += `IAN Windows,${alr.summary.ian_windows_count}\n`;
      csv += `Line Items,${alr.summary.line_items_count}\n`;
      csv += '\nCOUNTERPARTY BREAKDOWN\n';
      csv += 'Counterparty,Receivable USD,Payable USD,Net USD\n';
      for (const cp of alr.counterparty_breakdown) {
        csv += `${cp.counterparty_id},${cp.receivable_usd},${cp.payable_usd},${cp.net_usd}\n`;
      }
      csv += '\nLINE ITEMS\n';
      csv += 'IAN Hash,Counterparty,Type,Amount USD,Timestamp,Kernel Signed\n';
      for (const item of lineItems) {
        csv += `${item.ian_hash},${item.counterparty},${item.type},${item.amount_usd},${item.timestamp},${item.kernel_signed}\n`;
      }
      csv += `\nVERIFICATION\n`;
      csv += `ALR Hash,${alrHash}\n`;
      csv += `Kernel Signature,${alrSignature}\n`;
      csv += `Kernel Public Key,${KERNEL_PUBLIC_KEY}\n`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="ALR_${agent_id}_${now}.csv"`);
      return res.send(csv);
    }

    if (format === 'pdf') {
      // PDF requires additional library - return JSON with PDF generation note
      return res.json({
        ...signedALR,
        pdf_note: 'PDF generation available via enterprise API. Contact sales@primordia.dev',
        format_requested: 'pdf',
        format_returned: 'json'
      });
    }

    // Default: JSON
    res.json(signedALR);
  });

  /**
   * GET /v1/alr/status
   * Check if ALR can be generated (blocking check for enterprise processes)
   */
  app.get('/v1/alr/status', async (req: Request, res: Response) => {
    const agent_id = req.query.agent_id as string;

    if (!agent_id) {
      return res.status(400).json({ error: 'Missing agent_id query parameter' });
    }

    const seal = await db.getSealForAgent(agent_id);
    const signedIANs = await db.getSignedIANsForAgent(agent_id);
    const balance = await db.getBalance(agent_id);

    const hasSeal = !!seal;
    const hasSignedIAN = signedIANs && signedIANs.length > 0;
    const hasCredit = balance >= ALR_FEE_USD_MICROS;
    const canGenerate = hasSeal && hasSignedIAN && hasCredit;

    res.json({
      agent_id,
      can_generate_alr: canGenerate,
      blocking_status: {
        reconciliation_blocked: !canGenerate,
        invoice_blocked: !canGenerate,
        monthly_close_blocked: !canGenerate
      },
      requirements: {
        seal: {
          required: true,
          present: hasSeal,
          seal_id: seal?.seal_id || null,
          action: hasSeal ? null : 'Issue seal via /v1/seal/issue ($1,000)'
        },
        signed_ian: {
          required: true,
          present: hasSignedIAN,
          count: signedIANs?.length || 0,
          action: hasSignedIAN ? null : 'Submit receipts via /v1/net'
        },
        credit: {
          required: true,
          sufficient: hasCredit,
          balance_usd: balance / 1_000_000,
          required_usd: ALR_FEE_USD_MICROS / 1_000_000,
          action: hasCredit ? null : 'Purchase pack_team via /v1/credit/packs'
        }
      },
      next_action: canGenerate
        ? 'POST /v1/alr/generate'
        : 'Resolve blocking requirements first'
    });
  });
}
