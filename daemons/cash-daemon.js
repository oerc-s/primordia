#!/usr/bin/env node
/**
 * Daemon: cash-daemon
 * Monitors CreditsUSD; generates READY-TO-SEND outbound batches
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CASH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const TARGET_CREDITS_USD = 1000000;

function log(msg) {
  console.log(`[cash-daemon] ${new Date().toISOString()} ${msg}`);
}

async function fetchKpis() {
  try {
    const response = await fetch('http://localhost:3000/v1/credit/balance?agent_id=system', {
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const data = await response.json();
      return { credits_usd: data.balance / 1000000, source: 'kernel' };
    }
  } catch {
    // Kernel not running
  }

  // Fall back to local ledger
  const ledgerPath = join(ROOT, 'data', 'credit-ledger.json');
  if (existsSync(ledgerPath)) {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));
    const total = Object.values(ledger.balances || {}).reduce((a, b) => a + b, 0);
    return { credits_usd: total / 1000000, source: 'ledger' };
  }

  return { credits_usd: 0, source: 'none' };
}

function generateOutreachDrafts(gap) {
  const outreachPath = join(ROOT, 'dist', 'outreach', 'READY_TO_SEND');
  mkdirSync(outreachPath, { recursive: true });

  // Check for leads
  const leadsPath = join(ROOT, 'leads.csv');
  if (!existsSync(leadsPath)) {
    // Generate template
    const template = `email,name,company,notes
example@company.com,John Doe,ACME Corp,Interested in agent settlement
`;
    writeFileSync(join(ROOT, 'leads.template.csv'), template);
    log('No leads.csv found, created leads.template.csv');
    return 0;
  }

  // Parse leads
  const content = readFileSync(leadsPath, 'utf-8');
  const lines = content.trim().split('\n').slice(1);

  // Generate drafts
  const subject = 'Primordia: Inter-Agent Settlement Infrastructure';
  const body = `
Machine-to-machine value exchange primitives.

Primordia provides:
- MSR: Cryptographic settlement receipts
- IAN: Deterministic multi-party netting
- MBS: Agent solvency tracking

Clearing: 5 bps netting fee (prepaid credits)

Specs: https://primordia.dev/spec
SDK: npm install @primordia/sdk

---
Sent via cash-daemon
`.trim();

  let drafts = 0;
  for (const line of lines) {
    const [email, name] = line.split(',');
    if (!email || !email.includes('@')) continue;

    const draft = {
      to: email,
      subject,
      body: `Hi ${name || 'there'},\n\n${body}`,
      generated: new Date().toISOString()
    };

    writeFileSync(
      join(outreachPath, `draft_${email.replace(/[@.]/g, '_')}.json`),
      JSON.stringify(draft, null, 2)
    );
    drafts++;
  }

  return drafts;
}

async function checkSmtp() {
  const smtpHost = process.env.SMTP_HOST || process.env.SES_REGION;
  return !!smtpHost;
}

async function cashCycle() {
  log('Starting cash cycle...');

  // Fetch KPIs
  const kpi = await fetchKpis();
  log(`Credits: $${kpi.credits_usd.toLocaleString()} (source: ${kpi.source})`);

  // Calculate gap
  const gap = TARGET_CREDITS_USD - kpi.credits_usd;
  const progress = (kpi.credits_usd / TARGET_CREDITS_USD) * 100;

  log(`Target: $${TARGET_CREDITS_USD.toLocaleString()}`);
  log(`Gap: $${gap.toLocaleString()} (${progress.toFixed(2)}% complete)`);

  // Generate outreach if below target
  if (gap > 0) {
    const drafts = generateOutreachDrafts(gap);
    log(`Generated ${drafts} outreach drafts`);

    // Check if we can send
    const hasSmtp = await checkSmtp();
    if (hasSmtp) {
      log('SMTP configured - would send emails');
      // Actual sending would go here
    } else {
      log('SMTP not configured - drafts in dist/outreach/READY_TO_SEND');
    }
  }

  // Write cash report
  const reportPath = join(ROOT, 'dist', 'cash-report.json');
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    credits_usd: kpi.credits_usd,
    target_usd: TARGET_CREDITS_USD,
    gap_usd: gap,
    progress_pct: progress,
    source: kpi.source
  }, null, 2));

  log('Cash cycle complete');
}

async function main() {
  log('Starting cash-daemon');
  log(`Target: $${TARGET_CREDITS_USD.toLocaleString()}`);

  // Initial cycle
  await cashCycle();

  // Scheduled cycles
  setInterval(cashCycle, CASH_INTERVAL);

  log('Daemon running');
}

process.on('SIGINT', () => {
  log('Shutting down');
  process.exit(0);
});

main().catch(console.error);
