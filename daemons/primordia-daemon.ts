#!/usr/bin/env node
/**
 * Primordia Daemon - Health + Smoke + KPI
 * Runs continuously, prints KPI line every minute
 */

const KERNEL_URL = process.env.PRIMORDIA_KERNEL_URL || 'http://localhost:3000';
const INTERVAL_MS = 60_000; // 1 minute

interface KPILine {
  timestamp_ms: number;
  health: 'OK' | 'FAIL';
  credits_usd: number;
  netting_volume_usd: number;
  fees_usd: number;
  commitments_open_usd: number;
  default_events: number;
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${KERNEL_URL}/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}

async function getKPIs(): Promise<Partial<KPILine>> {
  try {
    const res = await fetch(`${KERNEL_URL}/v1/metrics`);
    if (res.ok) return await res.json();
  } catch {}
  return {};
}

async function runCycle(): Promise<void> {
  const health = await checkHealth();
  const kpis = await getKPIs();

  const line: KPILine = {
    timestamp_ms: Date.now(),
    health: health ? 'OK' : 'FAIL',
    credits_usd: kpis.credits_usd || 0,
    netting_volume_usd: kpis.netting_volume_usd || 0,
    fees_usd: kpis.fees_usd || 0,
    commitments_open_usd: kpis.commitments_open_usd || 0,
    default_events: kpis.default_events || 0,
  };

  // KPI line format
  console.log(`[primordia] ${new Date().toISOString()} | health=${line.health} | credits=$${line.credits_usd} | volume=$${line.netting_volume_usd} | fees=$${line.fees_usd} | commits=$${line.commitments_open_usd} | defaults=${line.default_events}`);
}

async function main(): Promise<void> {
  console.error('[primordia-daemon] Starting...');
  console.error(`[primordia-daemon] Kernel: ${KERNEL_URL}`);
  console.error(`[primordia-daemon] Interval: ${INTERVAL_MS}ms`);

  // Run immediately
  await runCycle();

  // Then on interval
  setInterval(runCycle, INTERVAL_MS);
}

main().catch(console.error);
