#!/usr/bin/env node
/**
 * Primordia Host Adapter - Enterprise Chargeback
 *
 * Commands:
 *   primordia ingest --org ORG --in usage.jsonl --out out/ --kernel BASE_URL
 *   primordia close  --org ORG --epoch 2025-12 --in out/ --kernel BASE_URL
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const KERNEL_URL = process.env.KERNEL_URL || 'http://localhost:3000';

interface UsageEvent {
  event_id: string;
  timestamp: string;
  org_id: string;
  resource_type: string;
  units: number;
  unit_type: string;
  cost_usd: number;
  metadata?: Record<string, unknown>;
}

interface MSR {
  msr_version: string;
  payer_agent_id: string;
  payee_agent_id: string;
  resource_type: string;
  units: number;
  unit_type: string;
  price_usd_micros: number;
  timestamp_ms: number;
  nonce: string;
  scope_hash: string;
  request_hash: string;
  response_hash: string;
  prev_receipt_hash: string | null;
  signature_ed25519: string;
}

interface InclusionProof {
  window_id: string;
  leaf_hash: string;
  leaf_index: number;
  proof_path: string[];
  root_hash: string;
  signed_head?: {
    window_id: string;
    root_hash: string;
    timestamp_ms: number;
    signature_ed25519: string;
  };
}

interface Proofpack {
  proofpack_version: string;
  type: string;
  epoch_id: string;
  org_id: string;
  root: {
    hash: string;
    timestamp_ms: number;
  };
  receipts: MSR[];
  inclusion_proofs: InclusionProof[];
  result: {
    type: string;
    payload: unknown;
  };
  proofpack_hash: string;
  kernel_signature: string;
}

interface ParsedArgs {
  command: string;
  args: Record<string, string>;
  flags: Set<string>;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const parsed: Record<string, string> = {};
  const flags = new Set<string>();

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      // Check if next arg exists and doesn't start with --
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed[key] = args[i + 1];
        i++; // Skip next arg since we consumed it
      } else {
        // It's a flag
        flags.add(key);
      }
    }
  }

  return { command, args: parsed, flags };
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function simpleHash(data: string): string {
  // Simple hash for demo - in production use blake3
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

async function ingest(orgId: string, inputFile: string, outputDir: string, kernelUrl: string): Promise<void> {
  console.log(`Ingesting usage logs for org: ${orgId}`);
  console.log(`Input: ${inputFile}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Kernel: ${kernelUrl}`);

  // Read usage events
  const content = readFileSync(inputFile, 'utf-8');
  const events: UsageEvent[] = content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  console.log(`Found ${events.length} usage events`);

  // Create output directory
  mkdirSync(outputDir, { recursive: true });

  const msrs: MSR[] = [];
  const receiptHashes: string[] = [];

  for (const event of events) {
    // Convert to MSR
    const msr: MSR = {
      msr_version: '0.1',
      payer_agent_id: simpleHash(event.org_id),
      payee_agent_id: simpleHash('primordia-kernel'),
      resource_type: event.resource_type,
      units: event.units,
      unit_type: event.unit_type,
      price_usd_micros: Math.round(event.cost_usd * 1_000_000),
      timestamp_ms: new Date(event.timestamp).getTime(),
      nonce: generateNonce(),
      scope_hash: simpleHash(event.resource_type),
      request_hash: simpleHash(event.event_id),
      response_hash: simpleHash(JSON.stringify(event.metadata || {})),
      prev_receipt_hash: msrs.length > 0 ? receiptHashes[receiptHashes.length - 1] : null,
      signature_ed25519: 'host_adapter_sig'
    };

    msrs.push(msr);

    // Compute receipt hash
    const receiptHash = simpleHash(JSON.stringify(msr));
    receiptHashes.push(receiptHash);

    // Submit to index
    try {
      const response = await fetch(`${kernelUrl}/v1/index/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'MSR',
          payload_hash: receiptHash
        })
      });

      if (!response.ok) {
        console.warn(`Warning: Failed to submit receipt ${receiptHash}`);
      }
    } catch (e) {
      console.warn(`Warning: Kernel not reachable, receipts stored locally`);
    }
  }

  // Write PRIMARY OUTPUT: receipts.msr.jsonl (one MSR per line)
  const receiptsFile = join(outputDir, 'receipts.msr.jsonl');
  writeFileSync(receiptsFile, msrs.map(m => JSON.stringify(m)).join('\n'));
  console.log(`Wrote ${msrs.length} receipts to ${receiptsFile}`);

  // Internal metadata for close command
  const hashesFile = join(outputDir, 'receipt_hashes.txt');
  writeFileSync(hashesFile, receiptHashes.join('\n'));
  console.log(`Wrote ${receiptHashes.length} hashes (internal)`);

  console.log('Ingest complete.');
}

async function close(
  orgId: string,
  epochId: string,
  inputDir: string,
  kernelUrl: string,
  exportCsv: boolean
): Promise<void> {
  console.log(`Closing epoch ${epochId} for org: ${orgId}`);
  console.log(`Input: ${inputDir}`);
  console.log(`Kernel: ${kernelUrl}`);
  console.log(`Export CSV: ${exportCsv}`);

  // Read receipt hashes
  const hashesFile = join(inputDir, 'receipt_hashes.txt');
  if (!existsSync(hashesFile)) {
    console.error(`Error: ${hashesFile} not found. Run ingest first.`);
    process.exit(1);
  }

  const receiptHashes = readFileSync(hashesFile, 'utf-8')
    .split('\n')
    .filter(h => h.trim());

  console.log(`Found ${receiptHashes.length} receipt hashes`);

  // Read receipts for proofpack
  const receiptsFile = join(inputDir, 'receipts.msr.jsonl');
  const receipts: MSR[] = [];
  if (existsSync(receiptsFile)) {
    const content = readFileSync(receiptsFile, 'utf-8');
    content.split('\n').filter(line => line.trim()).forEach(line => {
      receipts.push(JSON.parse(line));
    });
  }

  // STEP 1: Collect all inclusion proofs from kernel
  console.log('Collecting inclusion proofs from kernel...');
  const inclusionProofs: InclusionProof[] = [];
  for (const hash of receiptHashes) {
    try {
      const response = await fetch(
        `${kernelUrl}/v1/index/proof?window_id=current&leaf_hash=${hash}`
      );
      if (response.ok) {
        const proof = await response.json();
        inclusionProofs.push(proof as InclusionProof);
      } else {
        console.warn(`Warning: Could not fetch proof for ${hash}`);
      }
    } catch (e) {
      console.warn(`Warning: Kernel unreachable for proof ${hash}`);
    }
  }

  console.log(`Collected ${inclusionProofs.length} inclusion proofs`);

  // STEP 2: Attempt epoch close
  let nettingResult: unknown = null;
  let closeReceiptHash = '';

  try {
    const response = await fetch(`${kernelUrl}/v1/epoch/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId,
        epoch_id: epochId,
        receipt_hashes: receiptHashes,
        inclusion_proofs: inclusionProofs
      })
    });

    const result = await response.json();

    if (response.status === 402) {
      console.error('');
      console.error('═══════════════════════════════════════════════');
      console.error('  BOOKS OPEN — CREDIT REQUIRED');
      console.error('═══════════════════════════════════════════════');
      console.error(`  Required: $${(result.required_credit / 1_000_000).toFixed(2)}`);
      console.error(`  Current:  $${(result.current_credit / 1_000_000).toFixed(2)}`);
      console.error('');
      console.error(`  Purchase credit: ${kernelUrl}${result.packs_url}`);
      console.error('═══════════════════════════════════════════════');
      process.exit(1);
    }

    nettingResult = result.ian || result.netting || {};
    closeReceiptHash = result.close_receipt_hash || simpleHash(JSON.stringify(result));

    // STEP 3: Bundle into proofpack format
    const rootHash = inclusionProofs.length > 0
      ? inclusionProofs[0].root_hash
      : simpleHash(receiptHashes.join(''));

    const proofpack: Proofpack = {
      proofpack_version: '0.1',
      type: 'EPOCH_CLOSE',
      epoch_id: epochId,
      org_id: orgId,
      root: {
        hash: rootHash,
        timestamp_ms: Date.now()
      },
      receipts: receipts,
      inclusion_proofs: inclusionProofs,
      result: {
        type: 'IAN',
        payload: nettingResult
      },
      proofpack_hash: '',
      kernel_signature: ''
    };

    // Compute proofpack hash (before signing)
    const proofpackData = JSON.stringify({
      ...proofpack,
      proofpack_hash: '',
      kernel_signature: ''
    });
    proofpack.proofpack_hash = simpleHash(proofpackData);
    proofpack.kernel_signature = 'kernel_sig_placeholder'; // TODO: Real kernel signature

    // STEP 4: Write PRIMARY OUTPUT: epoch.proofpack.json
    const epochDir = join(inputDir, 'epoch', epochId);
    mkdirSync(epochDir, { recursive: true });

    const proofpackFile = join(epochDir, 'epoch.proofpack.json');
    writeFileSync(proofpackFile, JSON.stringify(proofpack, null, 2));
    console.log(`Wrote proofpack to ${proofpackFile}`);

    // STEP 5: OPTIONAL CSV EXPORT (only if --export-csv flag)
    if (exportCsv && result.journal_csv) {
      const csvFile = join(epochDir, 'journal.csv');
      writeFileSync(csvFile, result.journal_csv);
      console.log(`Exported CSV to ${csvFile}`);
    } else if (exportCsv) {
      console.warn('Warning: --export-csv flag set but no CSV data from kernel');
    }

    // Legacy IAN output (kept for compatibility)
    if (nettingResult) {
      writeFileSync(join(epochDir, 'netting.ian.json'), JSON.stringify(nettingResult, null, 2));
    }

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  EPOCH CLOSED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Epoch: ${epochId}`);
    console.log(`  Receipts: ${receiptHashes.length}`);
    console.log(`  Proofs: ${inclusionProofs.length}`);
    console.log(`  Proofpack: ${proofpackFile}`);
    if (exportCsv) {
      console.log(`  CSV Export: enabled`);
    }
    console.log('═══════════════════════════════════════════════');

  } catch (e) {
    console.error('Error closing epoch:', e);
    process.exit(1);
  }
}

function help(): void {
  console.log(`
Primordia Host Adapter - Enterprise Chargeback

Usage:
  primordia ingest --org ORG --in usage.jsonl --out out/ --kernel BASE_URL
  primordia close  --org ORG --epoch 2025-12 --in out/ --kernel BASE_URL [--export-csv]

Commands:
  ingest    Transform usage logs into canonical MSR receipts
  close     Close epoch with inclusion proofs and netting

Options:
  --org         Organization ID
  --in          Input file (ingest) or directory (close)
  --out         Output directory
  --epoch       Epoch ID (e.g., 2025-12)
  --kernel      Kernel URL (default: http://localhost:3000)
  --export-csv  (close only) Generate journal.csv export

Primary Outputs:
  ingest: receipts.msr.jsonl (one MSR per line)
  close:  epoch.proofpack.json (full proofpack with inclusion proofs)

Optional Exports:
  close --export-csv: journal.csv (accounting export)
`);
}

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs();

  switch (command) {
    case 'ingest':
      if (!args.org || !args.in || !args.out) {
        console.error('Missing required arguments. See --help');
        process.exit(1);
      }
      await ingest(args.org, args.in, args.out, args.kernel || KERNEL_URL);
      break;

    case 'close':
      if (!args.org || !args.epoch || !args.in) {
        console.error('Missing required arguments. See --help');
        process.exit(1);
      }
      const exportCsv = flags.has('export-csv');
      await close(args.org, args.epoch, args.in, args.kernel || KERNEL_URL, exportCsv);
      break;

    case 'help':
    default:
      help();
  }
}

main().catch(console.error);
