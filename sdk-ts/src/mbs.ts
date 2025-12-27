/**
 * Machine Balance Sheet (MBS) v0.1
 */

import { canonicalizeBytes } from './canonical.js';
import { hash, sign, verify } from './crypto.js';

export interface Asset {
  asset_type: string;
  amount: number;
}

export interface Liability {
  liability_type: string;
  amount: number;
}

export interface MBS {
  mbs_version: '0.1';
  agent_id: string;
  assets: Asset[];
  liabilities: Liability[];
  burn_rate_usd_micros_per_s: number;
  solvency_ratio: number;
  timestamp_ms: number;
  signature_ed25519: string;
}

export interface MBSInput {
  agent_id: string;
  assets: Asset[];
  liabilities: Liability[];
  burn_rate_usd_micros_per_s: number;
  timestamp_ms?: number;
}

const MAX_SOLVENCY = 999999;

export function compute_solvency_ratio(assets: Asset[], liabilities: Liability[]): number {
  const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);

  if (totalLiabilities === 0) {
    return MAX_SOLVENCY;
  }

  return Math.floor((totalAssets * 10000) / totalLiabilities);
}

export async function compute_mbs(input: MBSInput, privateKey: string): Promise<MBS> {
  const solvencyRatio = compute_solvency_ratio(input.assets, input.liabilities);

  const mbsWithoutSig = {
    mbs_version: '0.1' as const,
    agent_id: input.agent_id,
    assets: input.assets,
    liabilities: input.liabilities,
    burn_rate_usd_micros_per_s: input.burn_rate_usd_micros_per_s,
    solvency_ratio: solvencyRatio,
    timestamp_ms: input.timestamp_ms ?? Date.now()
  };

  const canonicalBytes = canonicalizeBytes(mbsWithoutSig);
  const mbsHash = hash(canonicalBytes);
  const signature = await sign(mbsHash, privateKey);

  return {
    ...mbsWithoutSig,
    signature_ed25519: signature
  };
}

export async function verify_mbs(mbs: MBS, publicKey: string): Promise<{ valid: boolean; error?: string }> {
  // Validate required fields
  if (mbs.mbs_version !== '0.1') {
    return { valid: false, error: 'Invalid mbs_version' };
  }

  // Validate asset amounts
  for (const asset of mbs.assets) {
    if (asset.amount < 0) {
      return { valid: false, error: 'Asset amount cannot be negative' };
    }
  }

  // Validate liability amounts
  for (const liability of mbs.liabilities) {
    if (liability.amount < 0) {
      return { valid: false, error: 'Liability amount cannot be negative' };
    }
  }

  // Validate burn rate
  if (mbs.burn_rate_usd_micros_per_s < 0) {
    return { valid: false, error: 'Burn rate cannot be negative' };
  }

  // Verify solvency ratio
  const expectedRatio = compute_solvency_ratio(mbs.assets, mbs.liabilities);
  if (mbs.solvency_ratio !== expectedRatio) {
    return { valid: false, error: 'Invalid solvency ratio' };
  }

  // Verify signature
  const { signature_ed25519, ...mbsWithoutSig } = mbs;
  const canonicalBytes = canonicalizeBytes(mbsWithoutSig);
  const mbsHash = hash(canonicalBytes);

  const isValid = await verify(mbsHash, signature_ed25519, publicKey);
  if (!isValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}

export function compute_runway_seconds(mbs: MBS): number {
  const totalAssets = mbs.assets.reduce((sum, a) => sum + a.amount, 0);
  const totalLiabilities = mbs.liabilities.reduce((sum, l) => sum + l.amount, 0);
  const netAssets = totalAssets - totalLiabilities;

  if (mbs.burn_rate_usd_micros_per_s === 0) {
    return netAssets > 0 ? Infinity : 0;
  }

  return Math.max(0, Math.floor(netAssets / mbs.burn_rate_usd_micros_per_s));
}
