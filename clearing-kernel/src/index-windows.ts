/**
 * Index Windows - Canonicality Clock
 * Append-only Merkle tree for receipt inclusion proofs
 */

import { hash } from './crypto.js';
import { canonicalizeBytes } from './canonical.js';

export interface IndexLeaf {
  leaf_hash: string;
  type: 'MSR' | 'IAN' | 'FC' | 'DBP' | 'AMR';
  payload_hash: string;
  submitted_at_ms: number;
  position: number;
}

export interface IndexWindow {
  window_id: string;
  window_version: string;
  previous_window_id: string | null;
  previous_root_hash: string | null;
  opened_at_ms: number;
  closed_at_ms: number | null;
  leaf_count: number;
  root_hash: string | null;
  kernel_signature: string | null;
}

export interface InclusionProof {
  window_id: string;
  leaf_hash: string;
  position: number;
  proof: Array<{ sibling: string; direction: 'left' | 'right' }>;
  root_hash: string;
  signed_head: SignedHead;
}

export interface SignedHead {
  window_id: string;
  root_hash: string;
  closed_at_ms: number | null;
  kernel_signature: string;
}

// In-memory storage (replace with DB in production)
const windows: Map<string, IndexWindow> = new Map();
const leaves: Map<string, IndexLeaf[]> = new Map(); // window_id -> leaves
let currentWindowId: string | null = null;

/**
 * Generate window ID based on date
 */
function generateWindowId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(windows.size + 1).padStart(3, '0');
  return `${year}-${month}-${seq}`;
}

/**
 * Compute leaf hash from type and payload hash
 */
export function computeLeafHash(type: string, payloadHash: string): string {
  return hash(canonicalizeBytes({ type, payload_hash: payloadHash }));
}

/**
 * Build Merkle tree and return root hash
 */
function buildMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    return hash(canonicalizeBytes({ empty: true }));
  }

  let level = [...leafHashes];

  // Pad to power of 2
  while (level.length > 1 && (level.length & (level.length - 1)) !== 0) {
    level.push(level[level.length - 1]); // Duplicate last
  }

  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      nextLevel.push(hash(canonicalizeBytes({ left, right })));
    }
    level = nextLevel;
  }

  return level[0];
}

/**
 * Generate inclusion proof for a leaf
 */
function generateProof(
  leafHashes: string[],
  position: number
): Array<{ sibling: string; direction: 'left' | 'right' }> {
  if (leafHashes.length <= 1) return [];

  const proof: Array<{ sibling: string; direction: 'left' | 'right' }> = [];
  let level = [...leafHashes];

  // Pad to power of 2
  while (level.length > 1 && (level.length & (level.length - 1)) !== 0) {
    level.push(level[level.length - 1]);
  }

  let idx = position;

  while (level.length > 1) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const sibling = level[siblingIdx] || level[idx];
    const direction = idx % 2 === 0 ? 'right' : 'left';

    proof.push({ sibling, direction });

    // Build next level
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      nextLevel.push(hash(canonicalizeBytes({ left, right })));
    }
    level = nextLevel;
    idx = Math.floor(idx / 2);
  }

  return proof;
}

/**
 * Verify inclusion proof
 */
export function verifyProof(
  leafHash: string,
  proof: Array<{ sibling: string; direction: 'left' | 'right' }>,
  rootHash: string
): boolean {
  let current = leafHash;

  for (const step of proof) {
    if (step.direction === 'left') {
      current = hash(canonicalizeBytes({ left: step.sibling, right: current }));
    } else {
      current = hash(canonicalizeBytes({ left: current, right: step.sibling }));
    }
  }

  return current === rootHash;
}

/**
 * Open a new window
 */
export function openWindow(kernelPrivateKey: string): IndexWindow {
  const windowId = generateWindowId();
  const previousWindow = currentWindowId ? windows.get(currentWindowId) : null;

  const window: IndexWindow = {
    window_id: windowId,
    window_version: '0.1',
    previous_window_id: previousWindow?.window_id || null,
    previous_root_hash: previousWindow?.root_hash || null,
    opened_at_ms: Date.now(),
    closed_at_ms: null,
    leaf_count: 0,
    root_hash: null,
    kernel_signature: null
  };

  windows.set(windowId, window);
  leaves.set(windowId, []);
  currentWindowId = windowId;

  return window;
}

/**
 * Submit receipt hash to current window
 */
export function submitToWindow(
  type: 'MSR' | 'IAN' | 'FC' | 'DBP' | 'AMR',
  payloadHash: string
): { window_id: string; leaf_hash: string; position: number; receipt_ack: string } {
  if (!currentWindowId) {
    throw new Error('No open window');
  }

  const window = windows.get(currentWindowId)!;
  if (window.closed_at_ms) {
    throw new Error('Window is closed');
  }

  const leafHash = computeLeafHash(type, payloadHash);
  const windowLeaves = leaves.get(currentWindowId)!;
  const position = windowLeaves.length;

  const leaf: IndexLeaf = {
    leaf_hash: leafHash,
    type,
    payload_hash: payloadHash,
    submitted_at_ms: Date.now(),
    position
  };

  windowLeaves.push(leaf);
  window.leaf_count = windowLeaves.length;

  return {
    window_id: currentWindowId,
    leaf_hash: leafHash,
    position,
    receipt_ack: 'pending_close'
  };
}

/**
 * Close current window and compute root
 */
export async function closeWindow(
  kernelPrivateKey: string,
  sign: (hash: string, privateKey: string) => Promise<string>
): Promise<IndexWindow> {
  if (!currentWindowId) {
    throw new Error('No open window');
  }

  const window = windows.get(currentWindowId)!;
  const windowLeaves = leaves.get(currentWindowId)!;

  const leafHashes = windowLeaves.map(l => l.leaf_hash);
  const rootHash = buildMerkleRoot(leafHashes);

  window.closed_at_ms = Date.now();
  window.root_hash = rootHash;

  // Sign the head
  const headData = canonicalizeBytes({
    window_id: window.window_id,
    root_hash: rootHash,
    closed_at_ms: window.closed_at_ms,
    leaf_count: window.leaf_count
  });
  window.kernel_signature = await sign(hash(headData), kernelPrivateKey);

  return window;
}

/**
 * Get current window head
 */
export function getHead(): {
  window_id: string;
  root_hash: string | null;
  leaf_count: number;
  signed_head: SignedHead | null;
} | null {
  if (!currentWindowId) return null;

  const window = windows.get(currentWindowId)!;

  return {
    window_id: window.window_id,
    root_hash: window.root_hash,
    leaf_count: window.leaf_count,
    signed_head: window.kernel_signature ? {
      window_id: window.window_id,
      root_hash: window.root_hash!,
      closed_at_ms: window.closed_at_ms,
      kernel_signature: window.kernel_signature
    } : null
  };
}

/**
 * Get inclusion proof for a leaf
 */
export function getProof(windowId: string, leafHash: string): InclusionProof | null {
  const window = windows.get(windowId);
  if (!window || !window.closed_at_ms) return null;

  const windowLeaves = leaves.get(windowId)!;
  const leaf = windowLeaves.find(l => l.leaf_hash === leafHash);
  if (!leaf) return null;

  const leafHashes = windowLeaves.map(l => l.leaf_hash);
  const proof = generateProof(leafHashes, leaf.position);

  return {
    window_id: windowId,
    leaf_hash: leafHash,
    position: leaf.position,
    proof,
    root_hash: window.root_hash!,
    signed_head: {
      window_id: window.window_id,
      root_hash: window.root_hash!,
      closed_at_ms: window.closed_at_ms,
      kernel_signature: window.kernel_signature!
    }
  };
}

/**
 * Initialize with an open window
 */
export function initializeIndex(kernelPrivateKey: string): void {
  if (!currentWindowId) {
    openWindow(kernelPrivateKey);
  }
}
