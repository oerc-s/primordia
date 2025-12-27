/**
 * Inter-Agent Netting (IAN) v0.1
 */

import { canonicalize, canonicalizeBytes } from './canonical.js';
import { hash, sign, verify } from './crypto.js';
import { MSR, get_msr_hash } from './msr.js';

export interface NetObligation {
  from: string;
  to: string;
  amount_usd_micros: number;
}

export interface IAN {
  ian_version: '0.1';
  epoch_id: string;
  participants: string[];
  included_receipt_hashes: string[];
  net_obligations: NetObligation[];
  netting_hash: string;
  signature_ed25519: string;
}

export interface NettingResult {
  obligations: NetObligation[];
  participants: string[];
  receipt_hashes: string[];
  total_volume: number;
}

export function net_receipts(receipts: MSR[]): NettingResult {
  // 1. Collect all receipt hashes and sort receipts deterministically
  const receiptHashes = receipts.map(r => get_msr_hash(r)).sort();
  const sortedReceipts = [...receipts].sort((a, b) =>
    get_msr_hash(a).localeCompare(get_msr_hash(b))
  );

  // 2. Build balance matrix
  const balances = new Map<string, number>();
  let totalVolume = 0;

  for (const receipt of sortedReceipts) {
    const key = `${receipt.payer_agent_id}|${receipt.payee_agent_id}`;
    const current = balances.get(key) ?? 0;
    balances.set(key, current + receipt.price_usd_micros);
    totalVolume += receipt.price_usd_micros;
  }

  // 3. Collect all participants
  const participantSet = new Set<string>();
  for (const receipt of sortedReceipts) {
    participantSet.add(receipt.payer_agent_id);
    participantSet.add(receipt.payee_agent_id);
  }
  const participants = Array.from(participantSet).sort();

  // 4. Net bilateral pairs
  const netBalances = new Map<string, number>();
  const processed = new Set<string>();

  const sortedKeys = Array.from(balances.keys()).sort();
  for (const key of sortedKeys) {
    const [a, b] = key.split('|');
    const pairKey = [a, b].sort().join('|');

    if (processed.has(pairKey)) continue;
    processed.add(pairKey);

    const aToB = balances.get(`${a}|${b}`) ?? 0;
    const bToA = balances.get(`${b}|${a}`) ?? 0;

    if (aToB > bToA) {
      netBalances.set(`${a}|${b}`, aToB - bToA);
    } else if (bToA > aToB) {
      netBalances.set(`${b}|${a}`, bToA - aToB);
    }
    // If equal, no net obligation
  }

  // 5. Convert to obligations array (sorted)
  const obligations: NetObligation[] = [];
  const sortedNetKeys = Array.from(netBalances.keys()).sort();
  for (const key of sortedNetKeys) {
    const [from, to] = key.split('|');
    obligations.push({
      from,
      to,
      amount_usd_micros: netBalances.get(key)!
    });
  }

  return {
    obligations,
    participants,
    receipt_hashes: receiptHashes,
    total_volume: totalVolume
  };
}

export function compute_netting_hash(epochId: string, receiptHashes: string[], obligations: NetObligation[]): string {
  const data = {
    epoch: epochId,
    receipts: [...receiptHashes].sort(),
    obligations
  };
  return hash(canonicalizeBytes(data));
}

export async function make_ian(
  epochId: string,
  receipts: MSR[],
  kernelPrivateKey: string
): Promise<IAN> {
  const result = net_receipts(receipts);
  const nettingHash = compute_netting_hash(epochId, result.receipt_hashes, result.obligations);

  const ianWithoutSig = {
    ian_version: '0.1' as const,
    epoch_id: epochId,
    participants: result.participants,
    included_receipt_hashes: result.receipt_hashes,
    net_obligations: result.obligations,
    netting_hash: nettingHash
  };

  const canonicalBytes = canonicalizeBytes(ianWithoutSig);
  const ianHash = hash(canonicalBytes);
  const signature = await sign(ianHash, kernelPrivateKey);

  return {
    ...ianWithoutSig,
    signature_ed25519: signature
  };
}

export async function verify_ian(ian: IAN, kernelPublicKey: string): Promise<{ valid: boolean; error?: string }> {
  // Validate required fields
  if (ian.ian_version !== '0.1') {
    return { valid: false, error: 'Invalid ian_version' };
  }

  // Verify all participants in obligations exist in participants list
  for (const obl of ian.net_obligations) {
    if (!ian.participants.includes(obl.from)) {
      return { valid: false, error: `Unknown participant: ${obl.from}` };
    }
    if (!ian.participants.includes(obl.to)) {
      return { valid: false, error: `Unknown participant: ${obl.to}` };
    }
    if (obl.from === obl.to) {
      return { valid: false, error: 'Self-obligation not allowed' };
    }
    if (obl.amount_usd_micros <= 0) {
      return { valid: false, error: 'Obligation amount must be positive' };
    }
  }

  // Verify netting hash
  const expectedNettingHash = compute_netting_hash(
    ian.epoch_id,
    ian.included_receipt_hashes,
    ian.net_obligations
  );
  if (ian.netting_hash !== expectedNettingHash) {
    return { valid: false, error: 'Invalid netting hash' };
  }

  // Verify signature
  const { signature_ed25519, ...ianWithoutSig } = ian;
  const canonicalBytes = canonicalizeBytes(ianWithoutSig);
  const ianHash = hash(canonicalBytes);

  const isValid = await verify(ianHash, signature_ed25519, kernelPublicKey);
  if (!isValid) {
    return { valid: false, error: 'Invalid kernel signature' };
  }

  return { valid: true };
}
