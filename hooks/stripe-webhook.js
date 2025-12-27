#!/usr/bin/env node
/**
 * Hook: stripe webhook verify (if configured)
 * SKIP if not configured
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const stripePath = join(ROOT, 'clearing-kernel', 'src', 'stripe.ts');

if (!existsSync(stripePath)) {
  console.log('SKIP: stripe.ts missing');
  process.exit(0);
}

const content = readFileSync(stripePath, 'utf-8');

// Check webhook handler exists
if (!content.includes('stripeWebhookHandler')) {
  console.error('FAIL: stripeWebhookHandler missing');
  process.exit(1);
}

// Check it handles checkout.session.completed
if (!content.includes('checkout.session.completed')) {
  console.error('FAIL: checkout.session.completed handler missing');
  process.exit(1);
}

// Check it credits the ledger
if (!content.includes('creditLedger.credit')) {
  console.error('FAIL: creditLedger.credit not called');
  process.exit(1);
}

console.log('PASS: stripe-webhook');
