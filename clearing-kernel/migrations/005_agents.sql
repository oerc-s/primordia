-- Migration 005: Agent Identity + Machine Transaction Hub
-- Financial identity, free settlements, escrow

-- Agent registry
CREATE TABLE IF NOT EXISTS agents (
  agent_id        TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  pubkey          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Rolling stats (updated on each settlement)
  total_volume_usd_micros  BIGINT DEFAULT 0,
  total_settlements        INTEGER DEFAULT 0,
  monthly_settlements      INTEGER DEFAULT 0,
  monthly_reset_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_volume ON agents (total_volume_usd_micros DESC);
CREATE INDEX IF NOT EXISTS idx_agents_created ON agents (created_at DESC);

-- Agent settlements (free tier: kernel-signed MSR between two agents)
CREATE TABLE IF NOT EXISTS agent_settlements (
  settlement_id   TEXT PRIMARY KEY,
  from_agent_id   TEXT NOT NULL REFERENCES agents(agent_id),
  to_agent_id     TEXT NOT NULL REFERENCES agents(agent_id),
  amount_usd_micros BIGINT NOT NULL,
  description     TEXT DEFAULT '',
  receipt_hash    TEXT NOT NULL,
  signature       TEXT NOT NULL,
  escrow_id       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_from ON agent_settlements (from_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_to ON agent_settlements (to_agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_created ON agent_settlements (created_at DESC);

-- Escrow: secure agent-to-agent transactions
-- Agent A locks funds → Agent B fulfills → Kernel releases
CREATE TABLE IF NOT EXISTS escrows (
  escrow_id       TEXT PRIMARY KEY,
  buyer_agent_id  TEXT NOT NULL REFERENCES agents(agent_id),
  seller_agent_id TEXT NOT NULL REFERENCES agents(agent_id),
  amount_usd_micros BIGINT NOT NULL,
  description     TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'locked',   -- locked, released, disputed, refunded, expired
  locked_at       TIMESTAMPTZ DEFAULT NOW(),
  released_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  receipt_hash    TEXT,
  signature       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrows_buyer ON escrows (buyer_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_escrows_seller ON escrows (seller_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows (status) WHERE status = 'locked';
