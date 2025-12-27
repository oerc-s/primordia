/**
 * P7: DBP - Default/Bankruptcy Primitive
 * Deterministic agent default and liquidation
 */

import { canonicalize, canonicalizeBytes } from './canonical.js';
import { hash, sign, verify } from './crypto.js';

export type DeclarationType = 'VOLUNTARY' | 'INVOLUNTARY' | 'AUTOMATIC';
export type TriggerType = 'MISSED_FC' | 'NEGATIVE_MBS' | 'MARGIN_CALL' | 'TIMEOUT';
export type LiquidationMethod = 'PRO_RATA' | 'PRIORITY' | 'AUCTION';

export interface Creditor {
  agent_id: string;
  amount_micros: number;
  priority: number;
  collateralized: boolean;
}

export interface Asset {
  asset_type: string;
  value_micros: number;
  liquid: boolean;
}

export interface Distribution {
  creditor_id: string;
  receives_micros: number;
  recovery_bps: number;
}

export interface DBP {
  dbp_version: string;
  default_id: string;
  defaulting_agent_id: string;
  declaration_type: DeclarationType;
  trigger: {
    type: TriggerType;
    reference_id: string;
    trigger_timestamp_ms: number;
  };
  obligations_snapshot: {
    total_owed_micros: number;
    creditors: Creditor[];
  };
  assets_snapshot: {
    total_value_micros: number;
    assets: Asset[];
  };
  recovery_rate_bps: number;
  liquidation_plan: {
    method: LiquidationMethod;
    distributions: Distribution[];
  };
  timestamp_ms: number;
  arbiter_agent_id: string;
  dbp_hash: string;
  signature_ed25519: string;
}

export interface MakeDBPParams {
  defaulting_agent_id: string;
  declaration_type: DeclarationType;
  trigger_type: TriggerType;
  trigger_reference_id: string;
  creditors: Creditor[];
  assets: Asset[];
  liquidation_method: LiquidationMethod;
  arbiter_agent_id: string;
  arbiter_private_key: string;
}

/**
 * Compute liquidation distributions based on method
 */
function computeDistributions(
  creditors: Creditor[],
  totalAssets: number,
  method: LiquidationMethod
): Distribution[] {
  // Handle empty creditors or zero owed
  if (creditors.length === 0) {
    return [];
  }

  const totalOwed = creditors.reduce((sum, c) => sum + c.amount_micros, 0);

  // Handle zero total owed
  if (totalOwed === 0) {
    return creditors.map(c => ({
      creditor_id: c.agent_id,
      receives_micros: 0,
      recovery_bps: 0
    }));
  }

  if (method === 'PRO_RATA') {
    return creditors.map(c => {
      const receives = Math.floor((c.amount_micros / totalOwed) * totalAssets);
      const recovery = c.amount_micros > 0 ? Math.floor((receives / c.amount_micros) * 10000) : 0;
      return {
        creditor_id: c.agent_id,
        receives_micros: receives,
        recovery_bps: recovery
      };
    });
  }

  if (method === 'PRIORITY') {
    const distributions: Distribution[] = [];
    let remaining = totalAssets;
    const sorted = [...creditors].sort((a, b) => a.priority - b.priority);

    for (const c of sorted) {
      const receives = Math.min(c.amount_micros, remaining);
      remaining -= receives;
      const recovery = c.amount_micros > 0 ? Math.floor((receives / c.amount_micros) * 10000) : 0;
      distributions.push({
        creditor_id: c.agent_id,
        receives_micros: receives,
        recovery_bps: recovery
      });
    }
    return distributions;
  }

  // AUCTION - same as PRO_RATA for now (auction logic external)
  return creditors.map(c => {
    const receives = Math.floor((c.amount_micros / totalOwed) * totalAssets);
    const recovery = c.amount_micros > 0 ? Math.floor((receives / c.amount_micros) * 10000) : 0;
    return {
      creditor_id: c.agent_id,
      receives_micros: receives,
      recovery_bps: recovery
    };
  });
}

/**
 * Create a signed DBP
 */
export async function make_dbp(params: MakeDBPParams): Promise<DBP> {
  const {
    defaulting_agent_id,
    declaration_type,
    trigger_type,
    trigger_reference_id,
    creditors,
    assets,
    liquidation_method,
    arbiter_agent_id,
    arbiter_private_key
  } = params;

  const now = Date.now();
  const totalOwed = creditors.reduce((sum, c) => sum + c.amount_micros, 0);
  const totalAssets = assets.reduce((sum, a) => sum + a.value_micros, 0);

  const distributions = computeDistributions(creditors, totalAssets, liquidation_method);
  const totalDistributed = distributions.reduce((sum, d) => sum + d.receives_micros, 0);
  const recovery_rate_bps = totalOwed > 0 ? Math.floor((totalDistributed / totalOwed) * 10000) : 0;

  // Create content for hashing (excludes default_id, dbp_hash, signature)
  const dbpContent = {
    dbp_version: '0.1',
    defaulting_agent_id,
    declaration_type,
    trigger: {
      type: trigger_type,
      reference_id: trigger_reference_id,
      trigger_timestamp_ms: now
    },
    obligations_snapshot: {
      total_owed_micros: totalOwed,
      creditors: [...creditors].sort((a, b) => a.agent_id.localeCompare(b.agent_id))
    },
    assets_snapshot: {
      total_value_micros: totalAssets,
      assets: [...assets].sort((a, b) => a.asset_type.localeCompare(b.asset_type))
    },
    recovery_rate_bps,
    liquidation_plan: {
      method: liquidation_method,
      distributions: distributions.sort((a, b) => a.creditor_id.localeCompare(b.creditor_id))
    },
    timestamp_ms: now,
    arbiter_agent_id
  };

  // Compute hash from content only
  const contentHash = hash(canonicalizeBytes(dbpContent));

  // Sign
  const signature = await sign(contentHash, arbiter_private_key);

  return {
    ...dbpContent,
    default_id: contentHash,
    dbp_hash: contentHash,
    signature_ed25519: signature
  };
}

/**
 * Extract hashable content from DBP (excludes default_id, dbp_hash, signature)
 */
function getDBPContent(dbp: DBP): object {
  const { default_id, dbp_hash, signature_ed25519, ...content } = dbp;
  return content;
}

/**
 * Verify DBP signature
 */
export async function verify_dbp(dbp: DBP): Promise<boolean> {
  const content = getDBPContent(dbp);
  const computedHash = hash(canonicalizeBytes(content));
  return verify(computedHash, dbp.signature_ed25519, dbp.arbiter_agent_id);
}

/**
 * Get DBP hash for referencing
 */
export function get_dbp_hash(dbp: DBP): string {
  const content = getDBPContent(dbp);
  return hash(canonicalizeBytes(content));
}

/**
 * Check if agent should trigger automatic default
 */
export function should_auto_default(
  runway_seconds: number,
  threshold_seconds: number = 0
): boolean {
  return runway_seconds < threshold_seconds;
}

/**
 * Cascade default calculation
 * Returns list of agents that would default if initial agent defaults
 */
export function calculate_cascade(
  initial_defaulter: string,
  agent_balances: Map<string, { runway_seconds: number; creditors: Creditor[] }>
): string[] {
  const cascaded: string[] = [initial_defaulter];
  const queue = [initial_defaulter];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const defaulter = queue.shift()!;
    if (processed.has(defaulter)) continue;
    processed.add(defaulter);

    const defaulterData = agent_balances.get(defaulter);
    if (!defaulterData) continue;

    // Check each creditor's exposure
    for (const creditor of defaulterData.creditors) {
      if (processed.has(creditor.agent_id)) continue;

      const creditorData = agent_balances.get(creditor.agent_id);
      if (!creditorData) continue;

      // Simple: if creditor loses this exposure, check runway
      // In reality, would recalculate MBS properly
      const newRunway = creditorData.runway_seconds - (creditor.amount_micros / 1000000);

      if (newRunway < 0) {
        cascaded.push(creditor.agent_id);
        queue.push(creditor.agent_id);
      }
    }
  }

  return cascaded;
}

/**
 * Trigger default for an agent
 * Creates DBP with AUTOMATIC or INVOLUNTARY declaration
 */
export async function trigger_default(params: {
  defaulting_agent_id: string;
  trigger_type: TriggerType;
  trigger_reference_id: string;
  creditors: Creditor[];
  assets: Asset[];
  liquidation_method: LiquidationMethod;
  arbiter_agent_id: string;
  arbiter_private_key: string;
  declaration_type?: 'AUTOMATIC' | 'INVOLUNTARY';
}): Promise<DBP> {
  return make_dbp({
    ...params,
    declaration_type: params.declaration_type || 'AUTOMATIC'
  });
}

/**
 * Resolve default by creating final settlement DBP
 * Used after liquidation auction or pro-rata distribution
 */
export async function resolve_default(params: {
  original_dbp: DBP;
  final_distributions: Distribution[];
  arbiter_agent_id: string;
  arbiter_private_key: string;
}): Promise<DBP> {
  const { original_dbp, final_distributions, arbiter_agent_id, arbiter_private_key } = params;

  // Recompute recovery rates based on final distributions
  const totalDistributed = final_distributions.reduce((sum, d) => sum + d.receives_micros, 0);
  const totalOwed = original_dbp.obligations_snapshot.total_owed_micros;
  const recovery_rate_bps = totalOwed > 0 ? Math.floor((totalDistributed / totalOwed) * 10000) : 0;

  const resolvedContent = {
    dbp_version: '0.1',
    defaulting_agent_id: original_dbp.defaulting_agent_id,
    declaration_type: 'INVOLUNTARY' as DeclarationType,
    trigger: {
      type: 'TIMEOUT' as TriggerType,
      reference_id: original_dbp.default_id,
      trigger_timestamp_ms: Date.now()
    },
    obligations_snapshot: original_dbp.obligations_snapshot,
    assets_snapshot: original_dbp.assets_snapshot,
    recovery_rate_bps,
    liquidation_plan: {
      method: 'AUCTION' as LiquidationMethod,
      distributions: final_distributions.sort((a, b) => a.creditor_id.localeCompare(b.creditor_id))
    },
    timestamp_ms: Date.now(),
    arbiter_agent_id
  };

  const contentHash = hash(canonicalizeBytes(resolvedContent));
  const signature = await sign(contentHash, arbiter_private_key);

  return {
    ...resolvedContent,
    default_id: contentHash,
    dbp_hash: contentHash,
    signature_ed25519: signature
  };
}
