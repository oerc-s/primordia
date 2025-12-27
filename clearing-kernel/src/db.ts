// PostgreSQL Database Layer for Clearing Kernel
// Replaces all in-memory storage with persistent, transactional storage

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

// Database connection pool
let pool: pg.Pool | null = null;

// Connection config from environment
function getConnectionConfig(): pg.PoolConfig {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    return {
      connectionString,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: parseInt(process.env.DATABASE_POOL_SIZE || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'primordia',
    user: process.env.PGUSER || 'primordia',
    password: process.env.PGPASSWORD || 'primordia',
    max: parseInt(process.env.DATABASE_POOL_SIZE || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

// Initialize database connection
export async function initDatabase(): Promise<void> {
  if (pool) return;

  const config = getConnectionConfig();
  pool = new Pool(config);

  // Test connection
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now');
    console.log(`[DB] Connected to PostgreSQL at ${result.rows[0].now}`);
    client.release();
  } catch (err) {
    console.error('[DB] FATAL: Cannot connect to PostgreSQL:', (err as Error).message);
    console.error('[DB] Clearing kernel requires PostgreSQL for clearing-grade operations.');
    process.exit(1);
  }

  // Run migrations
  await runMigrations();
}

// Run migrations
async function runMigrations(): Promise<void> {
  const migrationsDir = join(__dirname, '..', 'migrations');

  try {
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      console.log(`[DB] Running migration: ${file}`);
      await query(sql);
    }
    console.log('[DB] Migrations complete');
  } catch (err) {
    console.error('[DB] Migration error:', (err as Error).message);
    throw err;
  }
}

// Get database pool (fail fast if not initialized)
export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('[DB] Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

// Execute query
export async function query(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<any>> {
  const p = getPool();
  const start = Date.now();
  const result = await p.query(text, params);
  const duration = Date.now() - start;

  if (duration > 100) {
    console.log(`[DB] Slow query (${duration}ms): ${text.slice(0, 80)}...`);
  }

  return result;
}

// Execute in transaction
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// Receipt Operations
// ============================================================================

export interface Receipt {
  receipt_hash: string;
  type: string;
  payload_json: any;
  issuer_agent_id: string;
  nonce?: string;
  request_hash?: string;
  created_at: Date;
}

export async function storeReceipt(
  receipt_hash: string,
  type: string,
  payload: any,
  issuer_agent_id: string,
  nonce?: string,
  request_hash?: string
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO receipts (receipt_hash, type, payload_json, issuer_agent_id, nonce, request_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (receipt_hash) DO NOTHING`,
      [receipt_hash, type, JSON.stringify(payload), issuer_agent_id, nonce, request_hash]
    );
    return true;
  } catch (err) {
    if ((err as any).code === '23505') {
      // Duplicate key - idempotent success
      return true;
    }
    throw err;
  }
}

export async function getReceipt(receipt_hash: string): Promise<Receipt | null> {
  const result = await query(
    'SELECT * FROM receipts WHERE receipt_hash = $1',
    [receipt_hash]
  );
  return result.rows[0] || null;
}

export async function receiptExists(receipt_hash: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM receipts WHERE receipt_hash = $1',
    [receipt_hash]
  );
  return (result.rowCount ?? 0) > 0;
}

// Batch store receipts (returns accepted/rejected counts)
export async function storeReceiptsBatch(
  receipts: Array<{
    receipt_hash: string;
    type: string;
    payload: any;
    issuer_agent_id: string;
    nonce?: string;
  }>
): Promise<{ accepted: number; duplicate: number; failed: number }> {
  let accepted = 0;
  let duplicate = 0;
  let failed = 0;

  await transaction(async (client) => {
    for (const r of receipts) {
      try {
        const result = await client.query(
          `INSERT INTO receipts (receipt_hash, type, payload_json, issuer_agent_id, nonce)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (receipt_hash) DO NOTHING
           RETURNING receipt_hash`,
          [r.receipt_hash, r.type, JSON.stringify(r.payload), r.issuer_agent_id, r.nonce]
        );
        if ((result.rowCount ?? 0) > 0) {
          accepted++;
        } else {
          duplicate++;
        }
      } catch {
        failed++;
      }
    }
  });

  return { accepted, duplicate, failed };
}

// ============================================================================
// Credit Account Operations
// ============================================================================

export async function ensureAccount(agent_id: string): Promise<void> {
  await query(
    `INSERT INTO credit_accounts (agent_id, balance_usd_micros)
     VALUES ($1, 0)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agent_id]
  );
}

export async function getBalance(agent_id: string): Promise<number> {
  const result = await query(
    'SELECT balance_usd_micros FROM credit_accounts WHERE agent_id = $1',
    [agent_id]
  );
  return result.rows[0] ? parseInt(result.rows[0].balance_usd_micros, 10) : 0;
}

export async function addCredit(
  agent_id: string,
  amount_usd_micros: number,
  reason: string,
  reference?: string
): Promise<number> {
  return transaction(async (client) => {
    // Ensure account exists
    await client.query(
      `INSERT INTO credit_accounts (agent_id, balance_usd_micros)
       VALUES ($1, 0)
       ON CONFLICT (agent_id) DO NOTHING`,
      [agent_id]
    );

    // Update balance
    const result = await client.query<{ balance_usd_micros: string }>(
      `UPDATE credit_accounts
       SET balance_usd_micros = balance_usd_micros + $2,
           updated_at = NOW()
       WHERE agent_id = $1
       RETURNING balance_usd_micros`,
      [agent_id, amount_usd_micros]
    );

    const newBalance = parseInt(result.rows[0].balance_usd_micros, 10);

    // Record event
    await client.query(
      `INSERT INTO credit_events (agent_id, delta_usd_micros, reason, reference, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [agent_id, amount_usd_micros, reason, reference, newBalance]
    );

    return newBalance;
  });
}

export async function deductCredit(
  agent_id: string,
  amount_usd_micros: number,
  reason: string,
  reference?: string
): Promise<{ success: boolean; balance: number }> {
  return transaction(async (client) => {
    // Check and deduct atomically
    const result = await client.query<{ balance_usd_micros: string }>(
      `UPDATE credit_accounts
       SET balance_usd_micros = balance_usd_micros - $2,
           updated_at = NOW()
       WHERE agent_id = $1 AND balance_usd_micros >= $2
       RETURNING balance_usd_micros`,
      [agent_id, amount_usd_micros]
    );

    if (result.rowCount === 0) {
      const balResult = await client.query<{ balance_usd_micros: string }>(
        'SELECT balance_usd_micros FROM credit_accounts WHERE agent_id = $1',
        [agent_id]
      );
      return {
        success: false,
        balance: balResult.rows[0] ? parseInt(balResult.rows[0].balance_usd_micros, 10) : 0
      };
    }

    const newBalance = parseInt(result.rows[0].balance_usd_micros, 10);

    // Record event
    await client.query(
      `INSERT INTO credit_events (agent_id, delta_usd_micros, reason, reference, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [agent_id, -amount_usd_micros, reason, reference, newBalance]
    );

    return { success: true, balance: newBalance };
  });
}

// ============================================================================
// Credit Line Operations
// ============================================================================

export async function openCreditLine(
  credit_line_id: string,
  agent_id: string,
  mbs_reference: string,
  limit_usd_micros: number,
  terms_hash: string
): Promise<void> {
  await ensureAccount(agent_id);
  await query(
    `INSERT INTO credit_lines (credit_line_id, agent_id, mbs_reference, limit_usd_micros, terms_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [credit_line_id, agent_id, mbs_reference, limit_usd_micros, terms_hash]
  );
}

export async function drawFromCreditLine(
  credit_line_id: string,
  amount_usd_micros: number,
  draw_id: string
): Promise<{ success: boolean; agent_id?: string }> {
  return transaction(async (client) => {
    // Check and draw atomically
    const result = await client.query<{ agent_id: string; limit_usd_micros: string; drawn_usd_micros: string }>(
      `UPDATE credit_lines
       SET drawn_usd_micros = drawn_usd_micros + $2,
           updated_at = NOW()
       WHERE credit_line_id = $1
         AND status = 'active'
         AND (limit_usd_micros - drawn_usd_micros) >= $2
       RETURNING agent_id, limit_usd_micros, drawn_usd_micros`,
      [credit_line_id, amount_usd_micros]
    );

    if (result.rowCount === 0) {
      return { success: false };
    }

    const agent_id = result.rows[0].agent_id;

    // Add credit to agent account
    await addCredit(agent_id, amount_usd_micros, 'credit_line_draw', draw_id);

    return { success: true, agent_id };
  });
}

// ============================================================================
// Netting Window Operations
// ============================================================================

export async function getCurrentWindow(): Promise<{ window_id: string; start_ts: Date } | null> {
  const result = await query(
    `SELECT window_id, start_ts FROM netting_windows WHERE status = 'open' ORDER BY start_ts DESC LIMIT 1`
  );
  return result.rows[0] || null;
}

export async function createWindow(window_id: string): Promise<void> {
  await query(
    `INSERT INTO netting_windows (window_id, start_ts, status) VALUES ($1, NOW(), 'open')`,
    [window_id]
  );
}

export async function closeWindow(
  window_id: string,
  merkle_root: string,
  receipt_count: number,
  net_volume_usd_micros: number
): Promise<void> {
  await query(
    `UPDATE netting_windows
     SET status = 'closed', end_ts = NOW(), merkle_root = $2, receipt_count = $3, net_volume_usd_micros = $4
     WHERE window_id = $1`,
    [window_id, merkle_root, receipt_count, net_volume_usd_micros]
  );
}

// ============================================================================
// Netting Job Operations (Idempotent)
// ============================================================================

export async function createNettingJob(
  job_id: string,
  agent_id: string,
  input_hash: string,
  receipt_hashes: string[],
  window_id?: string
): Promise<{ created: boolean; existing_job_id?: string }> {
  try {
    await query(
      `INSERT INTO netting_jobs (job_id, agent_id, window_id, input_hash, receipt_hashes, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [job_id, agent_id, window_id, input_hash, receipt_hashes]
    );
    return { created: true };
  } catch (err) {
    if ((err as any).code === '23505') {
      // Duplicate input_hash - return existing job
      const result = await query(
        'SELECT job_id FROM netting_jobs WHERE input_hash = $1',
        [input_hash]
      );
      return { created: false, existing_job_id: result.rows[0]?.job_id };
    }
    throw err;
  }
}

export async function completeNettingJob(
  job_id: string,
  ian_hash: string,
  ian_payload: any,
  fee_charged_usd_micros: number
): Promise<void> {
  await query(
    `UPDATE netting_jobs
     SET status = 'completed', ian_hash = $2, ian_payload = $3, fee_charged_usd_micros = $4, completed_at = NOW()
     WHERE job_id = $1`,
    [job_id, ian_hash, JSON.stringify(ian_payload), fee_charged_usd_micros]
  );
}

export async function getNettingJob(input_hash: string): Promise<{
  job_id: string;
  status: string;
  ian_payload: any;
  fee_charged_usd_micros: number;
} | null> {
  const result = await query(
    'SELECT job_id, status, ian_payload, fee_charged_usd_micros FROM netting_jobs WHERE input_hash = $1',
    [input_hash]
  );
  if (!result.rows[0]) return null;
  return {
    ...result.rows[0],
    fee_charged_usd_micros: parseInt(result.rows[0].fee_charged_usd_micros, 10)
  };
}

// ============================================================================
// Seal Operations
// ============================================================================

export async function storeSeal(
  seal_id: string,
  target_base_url: string,
  conformance_report_hash: string,
  seal_payload: any,
  seal_hash: string,
  issued_by: string
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO seals (seal_id, target_base_url, conformance_report_hash, seal_payload_json, seal_hash, issued_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [seal_id, target_base_url, conformance_report_hash, JSON.stringify(seal_payload), seal_hash, issued_by]
    );
    return true;
  } catch (err) {
    if ((err as any).code === '23505') {
      return false; // Duplicate seal
    }
    throw err;
  }
}

export async function getSealByTarget(target_base_url: string): Promise<any | null> {
  const result = await query(
    'SELECT seal_payload_json FROM seals WHERE target_base_url = $1 ORDER BY created_at DESC LIMIT 1',
    [target_base_url]
  );
  return result.rows[0]?.seal_payload_json || null;
}

export async function getSealForAgent(agent_id: string): Promise<any | null> {
  const result = await query(
    'SELECT seal_id, target_base_url, seal_payload_json, seal_hash, created_at FROM seals WHERE target_base_url LIKE $1 ORDER BY created_at DESC LIMIT 1',
    ['%' + agent_id + '%']
  );
  if (result.rows.length === 0) return null;
  return {
    seal_id: result.rows[0].seal_id,
    target_base_url: result.rows[0].target_base_url,
    payload: result.rows[0].seal_payload_json,
    seal_hash: result.rows[0].seal_hash,
    created_at: result.rows[0].created_at
  };
}

// ============================================================================
// Default Case Operations
// ============================================================================

export async function triggerDefault(
  default_id: string,
  agent_id: string,
  reason_code: string
): Promise<void> {
  await query(
    `INSERT INTO default_cases (default_id, agent_id, reason_code)
     VALUES ($1, $2, $3)`,
    [default_id, agent_id, reason_code]
  );
}

export async function resolveDefault(
  default_id: string,
  action: string,
  params: any,
  resolution_receipt_id: string
): Promise<boolean> {
  const result = await query(
    `UPDATE default_cases
     SET resolved = TRUE, resolution_action = $2, resolution_params = $3,
         resolved_at = NOW(), resolution_receipt_id = $4
     WHERE default_id = $1 AND resolved = FALSE`,
    [default_id, action, JSON.stringify(params), resolution_receipt_id]
  );
  return (result.rowCount ?? 0) > 0;
}

// ============================================================================
// Metrics Operations
// ============================================================================

export async function recordMetric(
  metric_name: string,
  metric_value: number,
  labels?: Record<string, string>
): Promise<void> {
  await query(
    `INSERT INTO system_metrics (metric_name, metric_value, labels)
     VALUES ($1, $2, $3)`,
    [metric_name, metric_value, labels ? JSON.stringify(labels) : null]
  );
}

export async function getMetrics(): Promise<{
  total_receipts: number;
  total_credits_usd_micros: number;
  total_netting_volume_usd_micros: number;
  active_agents: number;
}> {
  const results = await Promise.all([
    query('SELECT COUNT(*) as count FROM receipts'),
    query('SELECT COALESCE(SUM(balance_usd_micros), 0) as total FROM credit_accounts'),
    query('SELECT COALESCE(SUM(net_volume_usd_micros), 0) as total FROM netting_windows WHERE status = \'closed\''),
    query('SELECT COUNT(*) as count FROM credit_accounts WHERE balance_usd_micros > 0'),
  ]);

  return {
    total_receipts: parseInt(results[0].rows[0].count, 10),
    total_credits_usd_micros: parseInt(results[1].rows[0].total, 10),
    total_netting_volume_usd_micros: parseInt(results[2].rows[0].total, 10),
    active_agents: parseInt(results[3].rows[0].count, 10),
  };
}

// ============================================================================
// Health Check
// ============================================================================

export async function healthCheck(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Get signed IANs for an agent (kernel-signed truth only)
export async function getSignedIANsForAgent(
  agent_id: string,
  as_of_epoch?: number
): Promise<Array<{ receipt_hash: string; payload_json: any; created_at: Date }>> {
  const result = await query(
    `SELECT receipt_hash, payload_json, created_at
     FROM receipts
     WHERE type = 'ian'
       AND (payload_json->'payload'->>'agent_id' = $1
            OR payload_json->'obligations' @> $2::jsonb)
     ORDER BY created_at DESC`,
    [agent_id, JSON.stringify([{ creditor_agent_id: agent_id }])]
  );
  return result.rows;
}

// Get pending (un-netted) receipts count for an agent
export async function getPendingReceiptsCount(agent_id: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*) as count
     FROM receipts
     WHERE issuer_agent_id = $1
       AND type IN ('msr', 'meter')
       AND request_hash IS NULL`,
    [agent_id]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}

// Cleanup
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
