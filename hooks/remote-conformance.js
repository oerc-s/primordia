#!/usr/bin/env node
/**
 * Hook: remote conformance (if BASE_URL configured)
 * SKIP if not configured
 */

const BASE_URL = process.env.BASE_URL || process.env.KERNEL_URL;

if (!BASE_URL) {
  console.log('SKIP: BASE_URL not configured');
  process.exit(0);
}

async function checkRemote() {
  try {
    // Health check
    const healthRes = await fetch(`${BASE_URL}/healthz`, { signal: AbortSignal.timeout(5000) });
    if (!healthRes.ok) {
      console.error('FAIL: /healthz not OK');
      return false;
    }

    // Spec check
    const specRes = await fetch(`${BASE_URL}/v1/spec`, { signal: AbortSignal.timeout(5000) });
    if (!specRes.ok) {
      console.error('FAIL: /v1/spec not OK');
      return false;
    }

    const spec = await specRes.json();
    if (!spec.versions || spec.versions.msr !== '0.1') {
      console.error('FAIL: spec version mismatch');
      return false;
    }

    // Verify endpoint (should work without credit)
    const verifyRes = await fetch(`${BASE_URL}/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'msr',
        payload: { msr_version: '0.1' }
      }),
      signal: AbortSignal.timeout(5000)
    });
    // Should not be 402
    if (verifyRes.status === 402) {
      console.error('FAIL: verify should not require credits');
      return false;
    }

    return true;
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    return false;
  }
}

const success = await checkRemote();
if (success) {
  console.log(`PASS: remote-conformance (${BASE_URL})`);
} else {
  process.exit(1);
}
