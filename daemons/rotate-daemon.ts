#!/usr/bin/env npx tsx
/**
 * PRIMORDIA EPOCH ROTATION DAEMON
 *
 * Rotates netting windows by time interval:
 * - Creates new windows periodically (default: 60s)
 * - Closes old windows and computes merkle roots
 * - Maintains stable performance under growth
 *
 * Environment:
 *   DATABASE_URL  - PostgreSQL connection string
 *   WINDOW_INTERVAL_MS - Window rotation interval (default: 60000)
 */

import pg from 'pg';
import { createHash } from 'crypto';

const { Pool } = pg;

// Configuration
const WINDOW_INTERVAL_MS = parseInt(process.env.WINDOW_INTERVAL_MS || '60000', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://primordia:primordia@localhost:5432/primordia';

// Database pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

// Compute merkle root from receipt hashes
function computeMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) {
    return createHash('blake2b512').update('empty').digest('hex').slice(0, 64);
  }

  const sorted = [...hashes].sort();

  // Simple merkle: hash all sorted hashes together
  const combined = sorted.join(':');
  return createHash('blake2b512').update(combined).digest('hex').slice(0, 64);
}

// Generate window ID
function generateWindowId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substr(2, 9);
  return `window_${ts}_${rand}`;
}

// Get current open window
async function getCurrentWindow(): Promise<{ window_id: string; start_ts: Date } | null> {
  const result = await pool.query<{ window_id: string; start_ts: Date }>(
    `SELECT window_id, start_ts FROM netting_windows WHERE status = 'open' ORDER BY start_ts DESC LIMIT 1`
  );
  return result.rows[0] || null;
}

// Create new window
async function createWindow(): Promise<string> {
  const window_id = generateWindowId();
  await pool.query(
    `INSERT INTO netting_windows (window_id, start_ts, status) VALUES ($1, NOW(), 'open')`,
    [window_id]
  );
  console.log(`[ROTATE] Created new window: ${window_id}`);
  return window_id;
}

// Close window and compute merkle root
async function closeWindow(window_id: string): Promise<void> {
  // Get all receipts in this window's time range
  const receiptsResult = await pool.query<{ receipt_hash: string }>(
    `SELECT r.receipt_hash FROM receipts r
     JOIN netting_windows w ON r.created_at >= w.start_ts
     WHERE w.window_id = $1 AND w.status = 'open'`,
    [window_id]
  );

  const hashes = receiptsResult.rows.map(r => r.receipt_hash);
  const merkle_root = computeMerkleRoot(hashes);

  // Calculate net volume from netting jobs
  const volumeResult = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(fee_charged_usd_micros), 0) as total FROM netting_jobs
     WHERE window_id = $1 AND status = 'completed'`,
    [window_id]
  );
  const net_volume = parseInt(volumeResult.rows[0]?.total || '0', 10);

  // Close the window
  await pool.query(
    `UPDATE netting_windows
     SET status = 'closed', end_ts = NOW(), merkle_root = $2, receipt_count = $3, net_volume_usd_micros = $4
     WHERE window_id = $1`,
    [window_id, merkle_root, hashes.length, net_volume]
  );

  console.log(`[ROTATE] Closed window ${window_id}: receipts=${hashes.length}, merkle_root=${merkle_root.slice(0, 16)}...`);
}

// Cleanup expired idempotency keys
async function cleanupIdempotencyKeys(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM idempotency_keys WHERE expires_at < NOW()`
  );
  return result.rowCount || 0;
}

// Main rotation loop
async function rotationLoop(): Promise<void> {
  console.log(`[ROTATE] Starting epoch rotation daemon (interval: ${WINDOW_INTERVAL_MS}ms)`);

  // Ensure we have an open window
  let currentWindow = await getCurrentWindow();
  if (!currentWindow) {
    await createWindow();
  }

  // Main loop
  while (true) {
    try {
      // Wait for interval
      await new Promise(resolve => setTimeout(resolve, WINDOW_INTERVAL_MS));

      // Get current window
      currentWindow = await getCurrentWindow();

      if (currentWindow) {
        // Check if window is old enough to rotate
        const windowAge = Date.now() - currentWindow.start_ts.getTime();

        if (windowAge >= WINDOW_INTERVAL_MS) {
          // Close current window
          await closeWindow(currentWindow.window_id);

          // Create new window
          await createWindow();
        }
      } else {
        // No open window, create one
        await createWindow();
      }

      // Cleanup expired idempotency keys
      const cleaned = await cleanupIdempotencyKeys();
      if (cleaned > 0) {
        console.log(`[ROTATE] Cleaned ${cleaned} expired idempotency keys`);
      }

    } catch (err) {
      console.error('[ROTATE] Error in rotation loop:', (err as Error).message);
      // Continue running despite errors
    }
  }
}

// Health check endpoint (optional HTTP server)
async function startHealthServer(): Promise<void> {
  const http = await import('http');
  const PORT = parseInt(process.env.ROTATE_DAEMON_PORT || '3001', 10);

  const server = http.createServer(async (req, res) => {
    if (req.url === '/healthz') {
      try {
        await pool.query('SELECT 1');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', daemon: 'rotate', timestamp: Date.now() }));
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'unhealthy', database: 'disconnected' }));
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, () => {
    console.log(`[ROTATE] Health server listening on port ${PORT}`);
  });
}

// Main
async function main(): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           PRIMORDIA EPOCH ROTATION DAEMON                     ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Test database connection
  try {
    await pool.query('SELECT NOW()');
    console.log('[ROTATE] Database connected');
  } catch (err) {
    console.error('[ROTATE] FATAL: Cannot connect to database:', (err as Error).message);
    process.exit(1);
  }

  // Start health server
  await startHealthServer();

  // Start rotation loop
  await rotationLoop();
}

main().catch(err => {
  console.error('[ROTATE] Fatal error:', err);
  process.exit(1);
});
