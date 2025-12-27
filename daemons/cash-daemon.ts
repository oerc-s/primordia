#!/usr/bin/env node
/**
 * Cash Daemon - Monitors credits, produces READY_TO_SEND drafts
 * Never sends unless SMTP creds exist AND leads.csv exists
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KERNEL_URL = process.env.PRIMORDIA_KERNEL_URL || 'http://localhost:3000';
const LEADS_PATH = join(__dirname, '..', 'data', 'leads.csv');
const DRAFTS_PATH = join(__dirname, '..', 'dist', 'drafts');
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface CreditStatus {
  total_credits_usd: number;
  active_agents: number;
  pending_intents: number;
}

async function getCreditStatus(): Promise<CreditStatus> {
  try {
    const res = await fetch(`${KERNEL_URL}/v1/credit/status`);
    if (res.ok) return await res.json();
  } catch {}
  return { total_credits_usd: 0, active_agents: 0, pending_intents: 0 };
}

function canSendEmail(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function hasLeads(): boolean {
  return existsSync(LEADS_PATH);
}

function generateDraft(status: CreditStatus): string {
  return `Subject: Primordia Credit Status Update

Total Credits: $${status.total_credits_usd.toLocaleString()}
Active Agents: ${status.active_agents}
Pending Intents: ${status.pending_intents}

Target: $1,000,000 prepaid credits
Progress: ${((status.total_credits_usd / 1_000_000) * 100).toFixed(1)}%

---
Generated: ${new Date().toISOString()}
Status: READY_TO_SEND (requires SMTP + leads.csv)
`;
}

async function runCycle(): Promise<void> {
  const status = await getCreditStatus();

  console.log(`[cash-daemon] Credits: $${status.total_credits_usd} | Agents: ${status.active_agents} | Target: $1,000,000`);

  // Generate draft
  if (!existsSync(DRAFTS_PATH)) mkdirSync(DRAFTS_PATH, { recursive: true });
  const draft = generateDraft(status);
  const draftFile = join(DRAFTS_PATH, `credit-update-${Date.now()}.txt`);
  writeFileSync(draftFile, draft);

  // Check if we can actually send
  if (canSendEmail() && hasLeads()) {
    console.log('[cash-daemon] READY_TO_SEND: SMTP configured, leads.csv exists');
    // Would send here, but we don't auto-send
  } else {
    console.log('[cash-daemon] Draft saved. Missing: ' +
      (!canSendEmail() ? 'SMTP_* env vars ' : '') +
      (!hasLeads() ? 'leads.csv' : ''));
  }
}

async function main(): Promise<void> {
  console.error('[cash-daemon] Starting...');
  console.error(`[cash-daemon] Kernel: ${KERNEL_URL}`);
  console.error(`[cash-daemon] Target: $1,000,000 prepaid credits`);

  await runCycle();
  setInterval(runCycle, INTERVAL_MS);
}

main().catch(console.error);
