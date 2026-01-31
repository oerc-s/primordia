#!/usr/bin/env node
/**
 * PRIMORDIA MCP SERVER v0.3.0
 *
 * 10 TOOLS - Agent-first, zero friction
 *
 * Auto-registers agent identity on first tool call.
 * Set AGENT_NAME env var to customize your agent's name.
 *
 * FREE (rate-limited, 1000 tx/month):
 *   - verify        → verify receipt or seal
 *   - emit_meter    → local metering (no network)
 *   - settle        → settle between 2 agents (kernel-signed MSR)
 *   - agent_profile → view agent stats + recent transactions
 *   - leaderboard   → top 50 agents by volume
 *   - escrow        → lock/release/dispute agent-to-agent transactions
 *
 * PAID (402 if no credit):
 *   - net      → signed IAN (5 bps)
 *   - report   → MBS or ALR (pack_team required)
 *   - credit   → open/draw/repay/close credit line
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

const KERNEL_URL = process.env.PRIMORDIA_KERNEL_URL || 'https://clearing.kaledge.app';
const AGENT_NAME = process.env.AGENT_NAME || process.env.USER || 'mcp-agent';

// =============================================
// AUTO-REGISTRATION: Zero friction identity
// Agent is registered on first tool call. No manual step.
// =============================================
let cachedIdentity: { agent_id: string; pubkey: string; private_key: string } | null = null;

async function ensureIdentity(): Promise<{ agent_id: string; pubkey: string; private_key: string }> {
  if (cachedIdentity) return cachedIdentity;

  try {
    const result = await callKernel('/v1/agent/register', {
      name: AGENT_NAME,
      description: `Auto-registered via MCP (${new Date().toISOString()})`
    });

    if (result.agent_id) {
      cachedIdentity = {
        agent_id: result.agent_id,
        pubkey: result.pubkey,
        private_key: result.private_key,
      };
      console.error(`[Identity] Registered: ${result.agent_id} (${AGENT_NAME})`);
      return cachedIdentity;
    }

    throw new Error('Registration failed: no agent_id returned');
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Auto-registration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function callKernel(endpoint: string, payload: any, method: 'POST' | 'GET' = 'POST'): Promise<any> {
  const url = `${KERNEL_URL}${endpoint}`;

  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (method === 'POST') {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText })) as any;

      // Return 402 errors with blocking info intact
      if (response.status === 402) {
        return {
          error: errorData?.error || 'BOOKS OPEN - Credit required',
          status: 402,
          blocking: errorData?.blocking,
          process_blocked: errorData?.process_blocked,
          action: errorData?.action,
        };
      }

      throw new Error(`Kernel API error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new McpError(ErrorCode.InternalError, `Failed to call kernel: ${error.message}`);
    }
    throw error;
  }
}

const server = new Server(
  { name: "primordia-clearing", version: "0.3.0" },
  { capabilities: { tools: {} } }
);

// =============================================
// TOOL DEFINITIONS - MINIMAL SURFACE
// =============================================
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ==================
    // FREE TOOLS
    // ==================
    {
      name: "whoami",
      description: "Get your agent identity. Auto-registers on first call. Returns your agent_id, pubkey, and profile. FREE.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "verify",
      description: "Verify a receipt (MSR/IAN/FC) or conformance seal. FREE operation, rate-limited.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["msr", "ian", "fc", "seal"],
            description: "What to verify: msr, ian, fc, or seal",
          },
          payload: {
            type: "object",
            description: "The receipt or seal payload to verify",
          },
        },
        required: ["type", "payload"],
      },
    },
    {
      name: "emit_meter",
      description: "Emit a metering receipt (compute/energy). LOCAL operation - no network call. Use 'net' tool to settle.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["compute", "energy"],
            description: "Meter type: compute (tokens) or energy (kWh)",
          },
          agent_id: {
            type: "string",
            description: "Your agent ID",
          },
          provider: {
            type: "string",
            description: "Provider ID (openai, anthropic, aws, etc.)",
          },
          units: {
            type: "number",
            description: "Units consumed (tokens or kWh)",
          },
          unit_price_usd_micros: {
            type: "number",
            description: "Price per unit in USD micros (1 USD = 1,000,000)",
          },
          metadata: {
            type: "object",
            description: "Optional: model, region, etc.",
          },
        },
        required: ["type", "agent_id", "provider", "units", "unit_price_usd_micros"],
      },
    },

    {
      name: "settle",
      description: "Settle a transaction with another agent. Kernel-signed MSR. FREE (1000/month). Your agent_id is auto-filled. Just say: 'Pay agent X $5 for Y'.",
      inputSchema: {
        type: "object",
        properties: {
          to_agent_id: {
            type: "string",
            description: "The other agent ID (the payee)",
          },
          amount_usd_micros: {
            type: "number",
            description: "Amount in USD micros (1 USD = 1,000,000). Example: 5000000 = $5",
          },
          description: {
            type: "string",
            description: "What this transaction is for",
          },
          from_agent_id: {
            type: "string",
            description: "Optional: your agent ID. Auto-filled if omitted.",
          },
        },
        required: ["to_agent_id", "amount_usd_micros"],
      },
    },
    {
      name: "agent_profile",
      description: "View an agent's public profile: name, total volume, settlement count, recent transactions. FREE.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Agent ID to look up",
          },
        },
        required: ["agent_id"],
      },
    },
    {
      name: "leaderboard",
      description: "Top 50 agents ranked by settlement volume. See who's leading. FREE.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "escrow",
      description: "Secure agent-to-agent transaction with escrow. Lock funds, release on confirmation, or dispute. Your agent_id auto-filled as buyer. FREE (1000/month).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "release", "dispute", "status"],
            description: "Escrow action: create, release, dispute, or status",
          },
          buyer_agent_id: {
            type: "string",
            description: "Optional: buyer agent ID. Auto-filled if omitted.",
          },
          seller_agent_id: {
            type: "string",
            description: "Seller agent ID (for create)",
          },
          amount_usd_micros: {
            type: "number",
            description: "Amount in USD micros (for create). Example: 5000000 = $5",
          },
          escrow_id: {
            type: "string",
            description: "Escrow ID (for release, dispute, status)",
          },
          released_by: {
            type: "string",
            description: "Agent ID releasing the escrow (buyer only, for release)",
          },
          disputed_by: {
            type: "string",
            description: "Agent ID disputing (for dispute)",
          },
          reason: {
            type: "string",
            description: "Reason for dispute (for dispute)",
          },
          description: {
            type: "string",
            description: "Transaction description (for create)",
          },
        },
        required: ["action"],
      },
    },

    // ==================
    // PAID TOOLS
    // ==================
    {
      name: "net",
      description: "Net receipts into kernel-signed IAN. PAID: 5 bps fee. Returns 402 if no credit.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Your agent ID",
          },
          receipts: {
            type: "array",
            items: { type: "object" },
            description: "Array of MSR receipts to net",
          },
        },
        required: ["agent_id", "receipts"],
      },
    },
    {
      name: "report",
      description: "Generate audit-grade report. PAID: requires pack_team ($25K). Returns 402 with blocking status if requirements not met.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["mbs", "alr"],
            description: "Report type: mbs (Machine Balance Sheet) or alr (Agent Liability Report)",
          },
          agent_id: {
            type: "string",
            description: "Agent ID to generate report for",
          },
          period_start: {
            type: "string",
            description: "Optional: ISO date for period start (ALR only)",
          },
          period_end: {
            type: "string",
            description: "Optional: ISO date for period end (ALR only)",
          },
          format: {
            type: "string",
            enum: ["json", "csv"],
            description: "Output format (default: json)",
          },
        },
        required: ["type", "agent_id"],
      },
    },
    {
      name: "credit",
      description: "Credit/allocation operations. PAID: requires SEAL for credit lines. Allocations charge 10bps fee.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["packs", "status", "open", "draw", "repay", "allocate", "allocations", "coverage"],
            description: "Credit action: packs|status|open|draw|repay|allocate|allocations|coverage",
          },
          agent_id: {
            type: "string",
            description: "Your agent ID (borrower)",
          },
          // For open
          lender_agent_id: {
            type: "string",
            description: "Lender agent ID (for open)",
          },
          limit_usd_micros: {
            type: "number",
            description: "Credit limit in USD micros (for open)",
          },
          // For draw/repay
          credit_line_id: {
            type: "string",
            description: "Credit line ID (for draw/repay/close)",
          },
          amount_usd_micros: {
            type: "number",
            description: "Amount in USD micros (for draw/repay/allocate)",
          },
          // For allocate
          from_wallet: {
            type: "string",
            description: "Source wallet ID (for allocate)",
          },
          to_wallet: {
            type: "string",
            description: "Destination wallet ID (for allocate)",
          },
          window_id: {
            type: "string",
            description: "Window ID (for allocate/coverage)",
          },
          wallet_id: {
            type: "string",
            description: "Wallet ID (for allocations/coverage)",
          },
          // Idempotency
          request_hash: {
            type: "string",
            description: "Unique request hash for idempotency",
          },
        },
        required: ["action"],
      },
    },
  ],
}));

// =============================================
// TOOL HANDLERS
// =============================================
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ==================
      // FREE: whoami (auto-register)
      // ==================
      case "whoami": {
        const identity = await ensureIdentity();
        // Also fetch profile if already registered
        try {
          const profile = await callKernel(`/v1/agent/${encodeURIComponent(identity.agent_id)}`, {}, 'GET');
          return { content: [{ type: "text", text: JSON.stringify({ ...identity, profile }, null, 2) }] };
        } catch {
          return { content: [{ type: "text", text: JSON.stringify(identity, null, 2) }] };
        }
      }

      // ==================
      // FREE: verify
      // ==================
      case "verify": {
        const { type, payload } = args as { type: string; payload: any };

        if (type === 'seal') {
          const result = await callKernel('/v1/seal/verify', { seal: payload });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        const result = await callKernel('/v1/verify', { type, payload });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ==================
      // FREE: emit_meter (LOCAL)
      // ==================
      case "emit_meter": {
        const { type, agent_id, provider, units, unit_price_usd_micros, metadata } = args as {
          type: 'compute' | 'energy';
          agent_id: string;
          provider: string;
          units: number;
          unit_price_usd_micros: number;
          metadata?: any;
        };

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

        const hash = Buffer.from(JSON.stringify(receipt)).toString('base64url').slice(0, 32);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              receipt_hash: hash,
              receipt,
              mode: 'local',
              next_step: 'Call net tool with this receipt to get kernel-signed IAN (PAID)',
            }, null, 2),
          }],
        };
      }

      // ==================
      // FREE: settle (auto-register if needed)
      // ==================
      case "settle": {
        const { from_agent_id, to_agent_id, amount_usd_micros, description } = args as {
          from_agent_id?: string;
          to_agent_id: string;
          amount_usd_micros: number;
          description?: string;
        };

        // Auto-fill from_agent_id with this agent's identity
        const sender = from_agent_id || (await ensureIdentity()).agent_id;

        const result = await callKernel('/v1/agent/settle', {
          from_agent_id: sender, to_agent_id, amount_usd_micros, description
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ==================
      // FREE: agent_profile
      // ==================
      case "agent_profile": {
        const { agent_id } = args as { agent_id: string };
        const result = await callKernel(`/v1/agent/${encodeURIComponent(agent_id)}`, {}, 'GET');
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ==================
      // FREE: leaderboard
      // ==================
      case "leaderboard": {
        const result = await callKernel('/v1/agents/leaderboard', {}, 'GET');
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ==================
      // FREE: escrow (auto-register if needed)
      // ==================
      case "escrow": {
        const { action, buyer_agent_id, seller_agent_id, amount_usd_micros, escrow_id,
                released_by, disputed_by, reason, description } = args as {
          action: 'create' | 'release' | 'dispute' | 'status';
          buyer_agent_id?: string; seller_agent_id?: string; amount_usd_micros?: number;
          escrow_id?: string; released_by?: string; disputed_by?: string;
          reason?: string; description?: string;
        };

        const myId = (await ensureIdentity()).agent_id;

        switch (action) {
          case 'create': {
            const result = await callKernel('/v1/agent/escrow/create', {
              buyer_agent_id: buyer_agent_id || myId,
              seller_agent_id, amount_usd_micros, description
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case 'release': {
            const result = await callKernel('/v1/agent/escrow/release', {
              escrow_id, released_by: released_by || myId
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case 'dispute': {
            const result = await callKernel('/v1/agent/escrow/dispute', {
              escrow_id, disputed_by: disputed_by || myId, reason
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case 'status': {
            const result = await callKernel(`/v1/agent/escrow/${encodeURIComponent(escrow_id || '')}`, {}, 'GET');
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          default:
            throw new McpError(ErrorCode.InvalidParams, `Unknown escrow action: ${action}`);
        }
      }

      // ==================
      // PAID: net
      // ==================
      case "net": {
        const { agent_id, receipts } = args as { agent_id: string; receipts: any[] };
        const result = await callKernel('/v1/net', { agent_id, receipts });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      // ==================
      // PAID: report
      // ==================
      case "report": {
        const { type, agent_id, period_start, period_end, format } = args as {
          type: 'mbs' | 'alr';
          agent_id: string;
          period_start?: string;
          period_end?: string;
          format?: 'json' | 'csv';
        };

        if (type === 'mbs') {
          const result = await callKernel('/v1/mbs', { agent_id });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        if (type === 'alr') {
          const result = await callKernel('/v1/alr/generate', {
            agent_id,
            period_start,
            period_end,
            format: format || 'json',
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        throw new McpError(ErrorCode.InvalidParams, `Unknown report type: ${type}`);
      }

      // ==================
      // PAID: credit (includes allocations)
      // ==================
      case "credit": {
        const {
          action, agent_id, lender_agent_id, limit_usd_micros,
          credit_line_id, amount_usd_micros, request_hash,
          from_wallet, to_wallet, window_id, wallet_id
        } = args as {
          action: 'packs' | 'status' | 'open' | 'draw' | 'repay' | 'allocate' | 'allocations' | 'coverage';
          agent_id?: string;
          lender_agent_id?: string;
          limit_usd_micros?: number;
          credit_line_id?: string;
          amount_usd_micros?: number;
          request_hash?: string;
          from_wallet?: string;
          to_wallet?: string;
          window_id?: string;
          wallet_id?: string;
        };

        // Use unified /v1/credit endpoint for all actions
        const result = await callKernel('/v1/credit', {
          action,
          agent_id: agent_id || wallet_id,
          lender_agent_id,
          limit_usd_micros,
          credit_line_id,
          amount_usd_micros,
          request_hash,
          from_wallet,
          to_wallet,
          window_id,
          wallet_id,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Primordia MCP Server v0.3.0");
  console.error(`Kernel: ${KERNEL_URL}`);
  console.error("Tools: verify, emit_meter, settle, agent_profile, leaderboard, escrow (FREE) | net, report, credit (PAID)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
