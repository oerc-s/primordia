#!/usr/bin/env node
/**
 * Flow Daemon - Continuous KPI monitoring
 * Prints: MSR/day, IAN/day, NettingVolume, CreditsUSD
 */

const KERNEL_URL = process.env.PRIMORDIA_KERNEL_URL || 'http://localhost:3000';
const INTERVAL_MS = parseInt(process.env.FLOW_INTERVAL_MS || '60000', 10); // 1 min

interface FlowMetrics {
  timestamp_ms: number;
  msr_count: number;
  ian_count: number;
  netting_volume_usd_micros: number;
  credits_usd_micros: number;
  batch_calls: number;
  net_calls: number;
}

let lastMetrics: FlowMetrics | null = null;

async function fetchMetrics(): Promise<Partial<FlowMetrics>> {
  try {
    const res = await fetch(`${KERNEL_URL}/v1/metrics`);
    if (res.ok) return await res.json();
  } catch {}
  return {};
}

function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

async function printFlow(): Promise<void> {
  const metrics = await fetchMetrics();
  const now = Date.now();

  const current: FlowMetrics = {
    timestamp_ms: now,
    msr_count: metrics.msr_count || 0,
    ian_count: metrics.ian_count || 0,
    netting_volume_usd_micros: metrics.netting_volume_usd_micros || 0,
    credits_usd_micros: metrics.credits_usd_micros || 0,
    batch_calls: metrics.batch_calls || 0,
    net_calls: metrics.net_calls || 0,
  };

  // Calculate rates if we have previous metrics
  let msrPerDay = 0;
  let ianPerDay = 0;

  if (lastMetrics) {
    const elapsed = (now - lastMetrics.timestamp_ms) / 1000 / 60 / 60 / 24; // days
    if (elapsed > 0) {
      msrPerDay = Math.round((current.msr_count - lastMetrics.msr_count) / elapsed);
      ianPerDay = Math.round((current.ian_count - lastMetrics.ian_count) / elapsed);
    }
  }

  lastMetrics = current;

  // KPI line
  console.log(`[flow] ${new Date().toISOString()} | MSR=${current.msr_count} (${msrPerDay}/day) | IAN=${current.ian_count} (${ianPerDay}/day) | Volume=${formatUsd(current.netting_volume_usd_micros)} | Credits=${formatUsd(current.credits_usd_micros)}`);
}

async function main(): Promise<void> {
  console.error('[flow-daemon] Starting...');
  console.error(`[flow-daemon] Kernel: ${KERNEL_URL}`);
  console.error(`[flow-daemon] Interval: ${INTERVAL_MS}ms`);
  console.error('');

  // Print header
  console.log('[flow] timestamp | MSR (rate) | IAN (rate) | Volume | Credits');
  console.log('[flow] ─────────────────────────────────────────────────────────');

  // Run immediately
  await printFlow();

  // Then on interval
  setInterval(printFlow, INTERVAL_MS);
}

main().catch(console.error);
