#!/usr/bin/env node
/**
 * Agent: release-engine
 * Mandate: Version bumps + changelog + announce payload
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const DIST_PATH = join(ROOT, 'dist');

console.log('Release Engine Agent');
console.log('=====================');

mkdirSync(DIST_PATH, { recursive: true });

// Current version
const VERSION = '0.1.0';
const RELEASE_DATE = new Date().toISOString().split('T')[0];

// Generate changelog
const changelog = `# Changelog

## v${VERSION} (${RELEASE_DATE})

### Added
- MSR (Machine Settlement Receipt) v0.1 specification
- FC (Future Commitment) v0.1 specification
- IAN (Inter-Agent Netting) v0.1 specification
- MBS (Machine Balance Sheet) v0.1 specification
- Canonical JSON specification
- TypeScript SDK (@primordia/sdk)
- Python SDK (primordia-sdk)
- Clearing kernel with credit system
- Conformance test suite

### Technical
- ed25519 signatures
- blake3 hashing
- Deterministic canonical JSON
- Prepaid credit model with netting fees (5 bps)
`;

writeFileSync(join(DIST_PATH, 'CHANGELOG.md'), changelog);
console.log('Generated: CHANGELOG.md');

// Generate announce payload
const announce = `# Primordia v${VERSION} Release

Inter-agent economic settlement primitives.

## What's New

Primordia provides cryptographic primitives for machine-to-machine value exchange:

- **MSR (Machine Settlement Receipt)**: Immutable proof of completed transaction
- **FC (Future Commitment)**: Signed forward obligation with penalty terms
- **IAN (Inter-Agent Netting)**: Deterministic bilateral netting
- **MBS (Machine Balance Sheet)**: Agent solvency tracking

## Get Started

TypeScript:
\`\`\`bash
npm install @primordia/sdk
\`\`\`

Python:
\`\`\`bash
pip install primordia-sdk
\`\`\`

## Clearing Kernel

Optional hosted netting service with prepaid credits.
- Verify: FREE (rate-limited)
- Netting: 5 bps of volume

Docs: https://primordia.dev/spec
`;

writeFileSync(join(DIST_PATH, 'announce.md'), announce);
console.log('Generated: announce.md');

// Version manifest
const manifest = {
  version: VERSION,
  release_date: RELEASE_DATE,
  components: {
    'sdk-ts': VERSION,
    'sdk-py': VERSION,
    'clearing-kernel': VERSION,
    'spec-msr': '0.1',
    'spec-fc': '0.1',
    'spec-ian': '0.1',
    'spec-mbs': '0.1'
  },
  checksums: {}
};

writeFileSync(join(DIST_PATH, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Generated: manifest.json');

console.log(`\nRelease ${VERSION} prepared`);
process.exit(0);
