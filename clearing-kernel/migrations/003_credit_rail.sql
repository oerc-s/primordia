-- PRIMORDIA CREDIT RAIL (RAIL-2) v0.1
-- Credit primitives with clearing-grade guarantees

BEGIN;

-- Drop all credit tables if they exist with wrong schema
DROP TABLE IF EXISTS collateral_locks CASCADE;
DROP TABLE IF EXISTS margin_calls CASCADE;
DROP TABLE IF EXISTS credit_events CASCADE;
DROP TABLE IF EXISTS credit_positions CASCADE;
DROP TABLE IF EXISTS credit_lines CASCADE;

-- Credit Lines
CREATE TABLE credit_lines (
    credit_line_id TEXT PRIMARY KEY,
    borrower_agent_id TEXT NOT NULL,
    lender_agent_id TEXT NOT NULL,
    limit_usd_micros BIGINT NOT NULL CHECK (limit_usd_micros > 0),
    spread_bps INTEGER NOT NULL DEFAULT 200 CHECK (spread_bps >= 0),
    maturity_ts BIGINT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed', 'liquidated')),
    seal_required BOOLEAN NOT NULL DEFAULT true,
    collateral_ratio_min_bps INTEGER DEFAULT 15000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_lines_borrower ON credit_lines(borrower_agent_id);
CREATE INDEX IF NOT EXISTS idx_credit_lines_lender ON credit_lines(lender_agent_id);
CREATE INDEX IF NOT EXISTS idx_credit_lines_status ON credit_lines(status);

-- Credit Positions (current state)
-- Drop and recreate if schema is wrong
DROP TABLE IF EXISTS credit_positions CASCADE;
CREATE TABLE credit_positions (
    credit_line_id TEXT PRIMARY KEY,
    borrower_agent_id TEXT NOT NULL,
    lender_agent_id TEXT NOT NULL,
    principal_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (principal_usd_micros >= 0),
    interest_accrued_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (interest_accrued_usd_micros >= 0),
    fees_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (fees_usd_micros >= 0),
    last_accrual_ts BIGINT,
    last_accrual_window TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_positions_borrower ON credit_positions(borrower_agent_id);
CREATE INDEX IF NOT EXISTS idx_credit_positions_lender ON credit_positions(lender_agent_id);

-- Credit Events (immutable log)
CREATE TABLE credit_events (
    event_id TEXT PRIMARY KEY DEFAULT 'evt_' || substr(md5(random()::text), 1, 16),
    credit_line_id TEXT NOT NULL REFERENCES credit_lines(credit_line_id),
    event_type TEXT NOT NULL CHECK (event_type IN ('CL_OPEN', 'CL_UPDATE', 'CL_CLOSE', 'DRAW', 'REPAY', 'IAR', 'FEE', 'MARGIN_CALL', 'MARGIN_RESOLVE', 'COLL_LOCK', 'COLL_UNLOCK', 'LIQ')),
    delta_principal_usd_micros BIGINT NOT NULL DEFAULT 0,
    delta_interest_usd_micros BIGINT NOT NULL DEFAULT 0,
    delta_fees_usd_micros BIGINT NOT NULL DEFAULT 0,
    payload_json JSONB NOT NULL,
    request_hash TEXT UNIQUE,
    receipt_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_events_line ON credit_events(credit_line_id);
CREATE INDEX IF NOT EXISTS idx_credit_events_type ON credit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_credit_events_created ON credit_events(created_at);

-- Margin Calls
CREATE TABLE margin_calls (
    margin_call_id TEXT PRIMARY KEY DEFAULT 'mc_' || substr(md5(random()::text), 1, 16),
    credit_line_id TEXT NOT NULL REFERENCES credit_lines(credit_line_id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'escalated', 'liquidated')),
    reason TEXT NOT NULL,
    required_usd_micros BIGINT NOT NULL CHECK (required_usd_micros > 0),
    due_ts BIGINT NOT NULL,
    resolved_ts BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_margin_calls_line ON margin_calls(credit_line_id);
CREATE INDEX IF NOT EXISTS idx_margin_calls_status ON margin_calls(status);

-- Collateral Locks
CREATE TABLE collateral_locks (
    collateral_lock_id TEXT PRIMARY KEY DEFAULT 'lock_' || substr(md5(random()::text), 1, 16),
    credit_line_id TEXT NOT NULL REFERENCES credit_lines(credit_line_id),
    asset_ref TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('ian', 'msr', 'fc', 'external')),
    amount_usd_micros BIGINT NOT NULL CHECK (amount_usd_micros > 0),
    status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'unlocked', 'liquidated')),
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlocked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_collateral_locks_line ON collateral_locks(credit_line_id);
CREATE INDEX IF NOT EXISTS idx_collateral_locks_status ON collateral_locks(status);

-- Credit Receipts (kernel-signed, audit-grade)
-- Uses existing receipts table with type='credit_*'
-- Adding credit-specific receipt types to constraint
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_type_check;
ALTER TABLE receipts ADD CONSTRAINT receipts_type_check
    CHECK (type IN ('msr', 'ian', 'fc', 'mbs', 'dbp', 'amr', 'meter',
                    'cl', 'draw', 'repay', 'iar', 'fee', 'margin', 'coll', 'liq'));

COMMIT;
