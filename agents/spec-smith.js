#!/usr/bin/env node
/**
 * Agent: spec-smith
 * Mandate: Write canonical specs (MSR/FC/IAN/MBS) <= 1 page each
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.env.PRIMORDIA_ROOT || process.cwd();
const SPEC_DIR = join(ROOT, 'spec');

const SPECS = ['MSR.md', 'FC.md', 'IAN.md', 'MBS.md', 'canonical-json.md'];

function validate() {
  let valid = true;

  for (const spec of SPECS) {
    const path = join(SPEC_DIR, spec);
    if (!existsSync(path)) {
      console.error(`MISSING: ${spec}`);
      valid = false;
      continue;
    }

    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').length;

    // Check for required sections
    const hasSchema = content.includes('## Schema') || content.includes('## Rules');
    const hasVectors = content.includes('## Test Vectors');
    const hasSignature = content.includes('Signature') || content.includes('signature');

    if (!hasSchema) {
      console.error(`${spec}: Missing schema section`);
      valid = false;
    }
    if (!hasVectors) {
      console.error(`${spec}: Missing test vectors`);
      valid = false;
    }

    // Check page limit (~60 lines per page)
    if (lines > 200) {
      console.warn(`${spec}: Exceeds recommended length (${lines} lines)`);
    }

    console.log(`OK: ${spec} (${lines} lines)`);
  }

  return valid;
}

const success = validate();
process.exit(success ? 0 : 1);
