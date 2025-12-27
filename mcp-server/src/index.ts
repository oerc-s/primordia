#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

const KERNEL_URL = process.env.PRIMORDIA_KERNEL_URL || 'http://localhost:3000';

// Helper function to call Primordia kernel API
async function callKernel(endpoint: string, payload: any): Promise<any> {
  const url = `${KERNEL_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kernel API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to call kernel: ${error.message}`
      );
    }
    throw error;
  }
}

const server = new Server(
  {
    name: "primordia-clearing",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "verify_receipt",
      description: "Verify signature of MSR/IAN/FC receipt (FREE operation)",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["MSR", "IAN", "FC"],
            description: "Receipt type: MSR (Micropayment Settlement Receipt), IAN (Inter-Agent Note), or FC (Future Commitment)",
          },
          payload: {
            type: "object",
            description: "The receipt payload to verify",
          },
        },
        required: ["type", "payload"],
      },
    },
    {
      name: "net_receipts",
      description: "Net multiple receipts into a signed IAN (PAID operation)",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Agent ID requesting the netting",
          },
          receipts: {
            type: "array",
            items: {
              type: "object",
            },
            description: "Array of receipts to net together",
          },
        },
        required: ["agent_id", "receipts"],
      },
    },
    // =====================
    // RAIL-2 CREDIT TOOLS
    // =====================
    {
      name: "open_credit_line",
      description: "Open a credit line between borrower and lender (PAID - 50 bps of limit, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          borrower_agent_id: {
            type: "string",
            description: "Borrower agent ID (must have valid Primordia Seal)",
          },
          lender_agent_id: {
            type: "string",
            description: "Lender agent ID",
          },
          limit_usd_micros: {
            type: "number",
            description: "Credit limit in USD micros (1 USD = 1,000,000 micros)",
          },
          spread_bps: {
            type: "number",
            description: "Interest rate spread in basis points (default: 200 = 2%)",
          },
          maturity_ts: {
            type: "number",
            description: "Optional maturity timestamp (epoch ms)",
          },
          collateral_ratio_min_bps: {
            type: "number",
            description: "Minimum collateral ratio in bps (default: 15000 = 150%)",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["borrower_agent_id", "lender_agent_id", "limit_usd_micros", "request_hash"],
      },
    },
    {
      name: "update_credit_line",
      description: "Update credit line parameters (PAID - $10, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID to update",
          },
          agent_id: {
            type: "string",
            description: "Agent ID (borrower or lender)",
          },
          limit_usd_micros: {
            type: "number",
            description: "New credit limit in USD micros",
          },
          spread_bps: {
            type: "number",
            description: "New interest rate spread in bps",
          },
          status: {
            type: "string",
            enum: ["active", "suspended"],
            description: "New status",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "agent_id", "request_hash"],
      },
    },
    {
      name: "close_credit_line",
      description: "Close a credit line (FREE, SEAL REQUIRED, must have zero balance)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID to close",
          },
          agent_id: {
            type: "string",
            description: "Agent ID (borrower or lender)",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "agent_id", "request_hash"],
      },
    },
    {
      name: "draw_credit",
      description: "Draw principal from a credit line (PAID - 10 bps of draw, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID to draw from",
          },
          borrower_agent_id: {
            type: "string",
            description: "Borrower agent ID",
          },
          amount_usd_micros: {
            type: "number",
            description: "Amount to draw in USD micros",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "borrower_agent_id", "amount_usd_micros", "request_hash"],
      },
    },
    {
      name: "repay_credit",
      description: "Repay principal, interest, or fees on a credit line (FREE, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID to repay",
          },
          borrower_agent_id: {
            type: "string",
            description: "Borrower agent ID",
          },
          principal_usd_micros: {
            type: "number",
            description: "Principal amount to repay in USD micros",
          },
          interest_usd_micros: {
            type: "number",
            description: "Interest amount to repay in USD micros",
          },
          fees_usd_micros: {
            type: "number",
            description: "Fees amount to repay in USD micros",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "borrower_agent_id", "request_hash"],
      },
    },
    {
      name: "accrue_interest",
      description: "Accrue interest on a credit position (PAID - $1, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID",
          },
          agent_id: {
            type: "string",
            description: "Agent ID (borrower or lender)",
          },
          window_id: {
            type: "string",
            description: "Accrual window identifier (e.g., 'window_2024_01')",
          },
          days_accrued: {
            type: "number",
            description: "Number of days to accrue interest for",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "agent_id", "window_id", "days_accrued", "request_hash"],
      },
    },
    {
      name: "apply_fee",
      description: "Apply a fee to a credit position (PAID - $1, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID",
          },
          agent_id: {
            type: "string",
            description: "Agent ID",
          },
          fee_type: {
            type: "string",
            enum: ["origination", "late", "maintenance", "other"],
            description: "Type of fee",
          },
          amount_usd_micros: {
            type: "number",
            description: "Fee amount in USD micros",
          },
          reason: {
            type: "string",
            description: "Reason for the fee",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "agent_id", "fee_type", "amount_usd_micros", "reason", "request_hash"],
      },
    },
    {
      name: "margin_call",
      description: "Issue or resolve a margin call (PAID - $100, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID",
          },
          agent_id: {
            type: "string",
            description: "Agent ID (lender for call, borrower for resolve)",
          },
          action: {
            type: "string",
            enum: ["call", "resolve", "escalate"],
            description: "Margin call action",
          },
          margin_call_id: {
            type: "string",
            description: "Margin call ID (required for resolve/escalate)",
          },
          reason: {
            type: "string",
            description: "Reason for margin call",
          },
          required_usd_micros: {
            type: "number",
            description: "Amount required to meet margin",
          },
          due_ts: {
            type: "number",
            description: "Due timestamp (epoch ms)",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "agent_id", "action", "request_hash"],
      },
    },
    {
      name: "lock_collateral",
      description: "Lock collateral against a credit line (PAID - $10, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID",
          },
          agent_id: {
            type: "string",
            description: "Borrower agent ID",
          },
          asset_ref: {
            type: "string",
            description: "Asset reference (e.g., 'ian:abc123', 'msr:def456')",
          },
          asset_type: {
            type: "string",
            enum: ["ian", "msr", "fc", "external"],
            description: "Type of collateral asset",
          },
          amount_usd_micros: {
            type: "number",
            description: "Collateral value in USD micros",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "agent_id", "asset_ref", "asset_type", "amount_usd_micros", "request_hash"],
      },
    },
    {
      name: "unlock_collateral",
      description: "Unlock collateral from a credit line (PAID - $10, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          collateral_lock_id: {
            type: "string",
            description: "Collateral lock ID to unlock",
          },
          agent_id: {
            type: "string",
            description: "Borrower agent ID",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["collateral_lock_id", "agent_id", "request_hash"],
      },
    },
    {
      name: "liquidate",
      description: "Liquidate a credit position (PAID - 5% of liquidated value, SEAL REQUIRED)",
      inputSchema: {
        type: "object",
        properties: {
          credit_line_id: {
            type: "string",
            description: "Credit line ID to liquidate",
          },
          agent_id: {
            type: "string",
            description: "Lender agent ID",
          },
          margin_call_id: {
            type: "string",
            description: "Associated margin call ID",
          },
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["credit_line_id", "agent_id", "margin_call_id", "request_hash"],
      },
    },
    {
      name: "commit_future",
      description: "Commit a Future Commitment (FC) to the clearing system (PAID operation)",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Agent ID making the commitment",
          },
          fc: {
            type: "object",
            description: "Future Commitment object with promise, collateral, and settlement terms",
          },
        },
        required: ["agent_id", "fc"],
      },
    },
    {
      name: "trigger_default",
      description: "Trigger a default event for an agent (PAID operation)",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Agent ID being defaulted",
          },
          reason: {
            type: "string",
            description: "Reason for the default (e.g., missed payment, insufficient collateral)",
          },
        },
        required: ["agent_id", "reason"],
      },
    },
    {
      name: "verify_seal",
      description: "Verify a conformance seal for protocol compliance (FREE operation)",
      inputSchema: {
        type: "object",
        properties: {
          seal: {
            type: "object",
            description: "Conformance seal object to verify",
          },
        },
        required: ["seal"],
      },
    },
    {
      name: "emit_meter",
      description: "Emit a metering receipt (Compute or Energy). LOCAL by default (no network). Set submit=true to index for later netting.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["compute", "energy"],
            description: "Meter type: 'compute' (GPU/CPU tokens) or 'energy' (kWh)",
          },
          agent_id: {
            type: "string",
            description: "Agent ID emitting the meter receipt",
          },
          provider: {
            type: "string",
            description: "Provider ID (e.g., 'openai', 'anthropic', 'aws')",
          },
          units: {
            type: "number",
            description: "Units consumed (tokens for compute, kWh for energy)",
          },
          unit_price_usd_micros: {
            type: "number",
            description: "Price per unit in USD micros (1 USD = 1,000,000 micros)",
          },
          metadata: {
            type: "object",
            description: "Optional metadata (model, region, etc.)",
          },
          submit: {
            type: "boolean",
            description: "If true, submit to kernel /v1/index/batch for later netting. Default: false (local only)",
          },
        },
        required: ["type", "agent_id", "provider", "units", "unit_price_usd_micros"],
      },
    },
    {
      name: "get_balance_sheet",
      description: "Get audit-grade Machine Balance Sheet (MBS) based on SIGNED IAN windows. PAID operation - requires credit or sealed agent.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Agent ID to get balance sheet for",
          },
          as_of_epoch: {
            type: "number",
            description: "Optional: epoch number for historical balance. Default: current",
          },
          include_pending: {
            type: "boolean",
            description: "Include pending (un-netted) receipts. Default: false",
          },
        },
        required: ["agent_id"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "verify_receipt": {
        const { type, payload } = args as { type: string; payload: any };
        const result = await callKernel('/v1/verify', {
          type: type.toLowerCase(),
          payload,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "net_receipts": {
        const { agent_id, receipts } = args as {
          agent_id: string;
          receipts: any[];
        };
        const result = await callKernel('/v1/net', {
          agent_id,
          receipts,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // =====================
      // RAIL-2 CREDIT HANDLERS
      // =====================
      case "open_credit_line": {
        const { borrower_agent_id, lender_agent_id, limit_usd_micros, spread_bps, maturity_ts, collateral_ratio_min_bps, request_hash } = args as {
          borrower_agent_id: string;
          lender_agent_id: string;
          limit_usd_micros: number;
          spread_bps?: number;
          maturity_ts?: number;
          collateral_ratio_min_bps?: number;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/line/open', {
          borrower_agent_id,
          lender_agent_id,
          limit_usd_micros,
          spread_bps: spread_bps || 200,
          maturity_ts,
          collateral_ratio_min_bps: collateral_ratio_min_bps || 15000,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "update_credit_line": {
        const { credit_line_id, agent_id, limit_usd_micros, spread_bps, status, request_hash } = args as {
          credit_line_id: string;
          agent_id: string;
          limit_usd_micros?: number;
          spread_bps?: number;
          status?: string;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/line/update', {
          credit_line_id,
          agent_id,
          limit_usd_micros,
          spread_bps,
          status,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "close_credit_line": {
        const { credit_line_id, agent_id, request_hash } = args as {
          credit_line_id: string;
          agent_id: string;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/line/close', {
          credit_line_id,
          agent_id,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "draw_credit": {
        const { credit_line_id, borrower_agent_id, amount_usd_micros, request_hash } = args as {
          credit_line_id: string;
          borrower_agent_id: string;
          amount_usd_micros: number;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/draw', {
          credit_line_id,
          borrower_agent_id,
          amount_usd_micros,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "repay_credit": {
        const { credit_line_id, borrower_agent_id, principal_usd_micros, interest_usd_micros, fees_usd_micros, request_hash } = args as {
          credit_line_id: string;
          borrower_agent_id: string;
          principal_usd_micros?: number;
          interest_usd_micros?: number;
          fees_usd_micros?: number;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/repay', {
          credit_line_id,
          borrower_agent_id,
          principal_usd_micros: principal_usd_micros || 0,
          interest_usd_micros: interest_usd_micros || 0,
          fees_usd_micros: fees_usd_micros || 0,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "accrue_interest": {
        const { credit_line_id, agent_id, window_id, days_accrued, request_hash } = args as {
          credit_line_id: string;
          agent_id: string;
          window_id: string;
          days_accrued: number;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/interest/accrue', {
          credit_line_id,
          agent_id,
          window_id,
          days_accrued,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "apply_fee": {
        const { credit_line_id, agent_id, fee_type, amount_usd_micros, reason, request_hash } = args as {
          credit_line_id: string;
          agent_id: string;
          fee_type: string;
          amount_usd_micros: number;
          reason: string;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/fee/apply', {
          credit_line_id,
          agent_id,
          fee_type,
          amount_usd_micros,
          reason,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "margin_call": {
        const { credit_line_id, agent_id, action, margin_call_id, reason, required_usd_micros, due_ts, request_hash } = args as {
          credit_line_id: string;
          agent_id: string;
          action: string;
          margin_call_id?: string;
          reason?: string;
          required_usd_micros?: number;
          due_ts?: number;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/margin/call', {
          credit_line_id,
          agent_id,
          action,
          margin_call_id,
          reason,
          required_usd_micros,
          due_ts,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "lock_collateral": {
        const { credit_line_id, agent_id, asset_ref, asset_type, amount_usd_micros, request_hash } = args as {
          credit_line_id: string;
          agent_id: string;
          asset_ref: string;
          asset_type: string;
          amount_usd_micros: number;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/collateral/lock', {
          credit_line_id,
          agent_id,
          asset_ref,
          asset_type,
          amount_usd_micros,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "unlock_collateral": {
        const { collateral_lock_id, agent_id, request_hash } = args as {
          collateral_lock_id: string;
          agent_id: string;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/collateral/unlock', {
          collateral_lock_id,
          agent_id,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "liquidate": {
        const { credit_line_id, agent_id, margin_call_id, request_hash } = args as {
          credit_line_id: string;
          agent_id: string;
          margin_call_id: string;
          request_hash: string;
        };
        const result = await callKernel('/v1/credit/liquidate', {
          credit_line_id,
          agent_id,
          margin_call_id,
          request_hash,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "commit_future": {
        const { agent_id, fc } = args as { agent_id: string; fc: any };
        const result = await callKernel('/v1/fc/commit', {
          agent_id,
          fc,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "trigger_default": {
        const { agent_id, reason } = args as {
          agent_id: string;
          reason: string;
        };
        const result = await callKernel('/v1/default/trigger', {
          agent_id,
          reason_code: reason,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "verify_seal": {
        const { seal } = args as { seal: any };
        const result = await callKernel('/v1/seal/verify', {
          seal,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "emit_meter": {
        const { type, agent_id, provider, units, unit_price_usd_micros, metadata, submit } = args as {
          type: 'compute' | 'energy';
          agent_id: string;
          provider: string;
          units: number;
          unit_price_usd_micros: number;
          metadata?: any;
          submit?: boolean;
        };

        // Create meter receipt locally
        const timestamp_ms = Date.now();
        const receipt = {
          meter_version: '0.1',
          type,
          agent_id,
          provider,
          units,
          unit_price_usd_micros,
          total_usd_micros: units * unit_price_usd_micros,
          timestamp_ms,
          metadata: metadata || {},
        };

        // Generate receipt hash (simplified - in production use proper crypto)
        const receiptStr = JSON.stringify(receipt);
        const hash = Buffer.from(receiptStr).toString('base64url').slice(0, 32);

        const localResult = {
          receipt_hash: hash,
          receipt,
          mode: 'local',
          message: 'Receipt emitted locally. Use submit=true to index for netting, or call net_receipts when ready to settle.',
        };

        // If submit=true, send to kernel for indexing (FREE operation)
        if (submit) {
          try {
            const indexResult = await callKernel('/v1/index/batch', {
              agent_id,
              receipts: [receipt],
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ...localResult,
                    mode: 'indexed',
                    index_result: indexResult,
                    message: 'Receipt indexed. Call net_receipts to settle and receive SIGNED IAN (PAID).',
                  }, null, 2),
                },
              ],
            };
          } catch (error) {
            // If indexing fails, still return local receipt
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ...localResult,
                    index_error: error instanceof Error ? error.message : 'Index failed',
                  }, null, 2),
                },
              ],
            };
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(localResult, null, 2),
            },
          ],
        };
      }

      case "get_balance_sheet": {
        const { agent_id, as_of_epoch, include_pending } = args as {
          agent_id: string;
          as_of_epoch?: number;
          include_pending?: boolean;
        };

        // This is a PAID operation - kernel will return 402 if no credit
        const result = await callKernel('/v1/mbs', {
          agent_id,
          as_of_epoch,
          include_pending: include_pending || false,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP communication
  console.error("Primordia Clearing MCP Server running on stdio");
  console.error(`Kernel URL: ${KERNEL_URL}`);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
