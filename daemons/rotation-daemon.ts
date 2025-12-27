#!/usr/bin/env node
/**
 * Rotation Daemon - Auto-rotate epochs/windows
 * Compaction + snapshot hash + epoch summary
 */

const KERNEL_URL = process.env.PRIMORDIA_KERNEL_URL || 'http://localhost:3000';
const ROTATION_INTERVAL_MS = parseInt(process.env.ROTATION_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10); // 24h
const EPOCH_PREFIX = process.env.EPOCH_PREFIX || 'epoch';

interface EpochSummary {
  epoch_id: string;
  window_id: string;
  opened_at_ms: number;
  closed_at_ms: number;
  receipt_count: number;
  netting_volume_usd_micros: number;
  snapshot_hash: string;
}

interface WindowState {
  window_id: string;
  leaf_count: number;
  root_hash: string | null;
}

let currentEpochNumber = 0;
const epochHistory: EpochSummary[] = [];

function generateEpochId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  currentEpochNumber++;
  return `${EPOCH_PREFIX}_${year}_${month}_${String(currentEpochNumber).padStart(3, '0')}`;
}

async function getWindowState(): Promise<WindowState | null> {
  try {
    const res = await fetch(`${KERNEL_URL}/v1/index/head`);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

async function closeWindow(): Promise<{ root_hash: string; leaf_count: number } | null> {
  try {
    const res = await fetch(`${KERNEL_URL}/v1/index/close`, { method: 'POST' });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

async function openNewWindow(): Promise<WindowState | null> {
  try {
    const res = await fetch(`${KERNEL_URL}/v1/index/open`, { method: 'POST' });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

function computeSnapshotHash(epochId: string, windowId: string, rootHash: string, receiptCount: number): string {
  // Simple hash of epoch state
  const data = `${epochId}:${windowId}:${rootHash}:${receiptCount}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

async function rotateEpoch(): Promise<void> {
  console.log('[rotation] Starting epoch rotation...');

  const currentWindow = await getWindowState();
  if (!currentWindow) {
    console.log('[rotation] No current window, skipping');
    return;
  }

  // Close current window
  const closed = await closeWindow();
  if (!closed) {
    console.log('[rotation] Failed to close window');
    return;
  }

  // Create epoch summary
  const epochId = generateEpochId();
  const summary: EpochSummary = {
    epoch_id: epochId,
    window_id: currentWindow.window_id,
    opened_at_ms: Date.now() - ROTATION_INTERVAL_MS, // Approximate
    closed_at_ms: Date.now(),
    receipt_count: closed.leaf_count,
    netting_volume_usd_micros: 0, // Would need to query
    snapshot_hash: computeSnapshotHash(epochId, currentWindow.window_id, closed.root_hash, closed.leaf_count)
  };

  epochHistory.push(summary);

  console.log(`[rotation] Epoch closed: ${epochId}`);
  console.log(`  window: ${summary.window_id}`);
  console.log(`  receipts: ${summary.receipt_count}`);
  console.log(`  snapshot: ${summary.snapshot_hash.slice(0, 16)}...`);

  // Open new window
  const newWindow = await openNewWindow();
  if (newWindow) {
    console.log(`[rotation] New window opened: ${newWindow.window_id}`);
  }
}

async function main(): Promise<void> {
  console.log('[rotation-daemon] Starting...');
  console.log(`[rotation-daemon] Kernel: ${KERNEL_URL}`);
  console.log(`[rotation-daemon] Interval: ${ROTATION_INTERVAL_MS}ms`);

  // Run initial check
  const window = await getWindowState();
  if (window) {
    console.log(`[rotation-daemon] Current window: ${window.window_id}, leaves: ${window.leaf_count}`);
  } else {
    console.log('[rotation-daemon] No window found, kernel may need initialization');
  }

  // Schedule rotation
  setInterval(rotateEpoch, ROTATION_INTERVAL_MS);

  // Keep alive
  process.on('SIGINT', () => {
    console.log('[rotation-daemon] Shutting down...');
    console.log(`[rotation-daemon] Epochs rotated: ${epochHistory.length}`);
    process.exit(0);
  });
}

main().catch(console.error);
