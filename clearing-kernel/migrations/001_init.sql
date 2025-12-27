-- Primordia Clearing Kernel PostgreSQL Schema v0.1.0
-- Initial migration: core tables for clearing-grade persistence
-- NOTE: credit_lines and credit_events are defined in 003_credit_rail.sql

BEGIN;

-- Receipts store (MSR/IAN/FC/MBS/DBP)
CREATE TABLE IF NOT EXISTS receipts (
    receipt_hash TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('msr', 'ian', 'fc', 'mbs', 'dbp', 'amr')),
    payload_json JSONB NOT NULL,
    issuer_agent_id TEXT NOT NULL,
    nonce TEXT,
    request_hash TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issuer_agent_id, nonce)
);
CREATE INDEX IF NOT EXISTS idx_receipts_issuer ON receipts(issuer_agent_id);
CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(type);
CREATE INDEX IF NOT EXISTS idx_receipts_created ON receipts(created_at);

-- Credit accounts (agent balances)
CREATE TABLE IF NOT EXISTS credit_accounts (
    agent_id TEXT PRIMARY KEY,
    balance_usd_micros BIGINT NOT NULL DEFAULT 0 CHECK (balance_usd_micros >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTE: credit_events and credit_lines are now defined in 003_credit_rail.sql
-- with different schema (borrower_agent_id, lender_agent_id instead of agent_id)

-- Netting windows (epochs)
CREATE TABLE IF NOT EXISTS netting_windows (
    window_id TEXT PRIMARY KEY,
    start_ts TIMESTAMPTZ NOT NULL,
    end_ts TIMESTAMPTZ,
    merkle_root TEXT,
    receipt_count INTEGER NOT NULL DEFAULT 0,
    net_volume_usd_micros BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_netting_windows_status ON netting_windows(status);
CREATE INDEX IF NOT EXISTS idx_netting_windows_start ON netting_windows(start_ts);

-- Netting jobs (idempotent net requests)
CREATE TABLE IF NOT EXISTS netting_jobs (
    job_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    window_id TEXT REFERENCES netting_windows(window_id),
    input_hash TEXT UNIQUE NOT NULL,
    receipt_hashes TEXT[] NOT NULL,
    ian_hash TEXT,
    ian_payload JSONB,
    fee_charged_usd_micros BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_netting_jobs_agent ON netting_jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_netting_jobs_window ON netting_jobs(window_id);
CREATE INDEX IF NOT EXISTS idx_netting_jobs_status ON netting_jobs(status);

-- Seals (conformance seals)
CREATE TABLE IF NOT EXISTS seals (
    seal_id TEXT PRIMARY KEY,
    target_base_url TEXT NOT NULL,
    conformance_report_hash TEXT NOT NULL,
    seal_payload_json JSONB NOT NULL,
    seal_hash TEXT UNIQUE NOT NULL,
    issued_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_seals_target ON seals(target_base_url);

-- Default cases
CREATE TABLE IF NOT EXISTS default_cases (
    default_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolution_action TEXT,
    resolution_params JSONB,
    resolved_at TIMESTAMPTZ,
    resolution_receipt_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_defaults_agent ON default_cases(agent_id);
CREATE INDEX IF NOT EXISTS idx_defaults_resolved ON default_cases(resolved);

-- Idempotency keys for batch operations
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key_hash TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- System metrics (for KPI tracking)
CREATE TABLE IF NOT EXISTS system_metrics (
    id BIGSERIAL PRIMARY KEY,
    metric_name TEXT NOT NULL,
    metric_value BIGINT NOT NULL,
    labels JSONB,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_time ON system_metrics(recorded_at);

COMMIT;
