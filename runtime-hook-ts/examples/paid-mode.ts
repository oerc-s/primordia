/**
 * Example: Paid mode usage
 *
 * Paid mode batches MSRs and submits signed IANs to the kernel.
 * Used in production for actual billing.
 */

import { createHook, wrapAnthropic } from '@primordia/runtime-hook';
import Anthropic from '@anthropic-ai/sdk';

async function main() {
  // Create hook in paid mode
  const hook = createHook({
    agentId: 'agent-prod-001',
    privateKey: process.env.PRIMORDIA_PRIVATE_KEY!,
    mode: 'paid',
    kernelUrl: process.env.KERNEL_URL || 'https://kernel.primordia.network',
    flushIntervalMs: 30000, // Auto-flush every 30 seconds
    batchSize: 50, // Auto-flush at 50 events
  });

  // Wrap Anthropic client
  const anthropic = wrapAnthropic(new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  }), hook);

  // Make LLM calls - automatically metered and batched
  console.log('Making LLM call 1...');
  const response1 = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'What is the meaning of life?' }
    ],
  });
  console.log('Response:', response1.content[0].text);

  console.log('\nMaking LLM call 2...');
  const response2 = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 512,
    messages: [
      { role: 'user', content: 'Write a haiku about coding.' }
    ],
  });
  console.log('Response:', response2.content[0].text);

  // Track a tool call
  console.log('\nTracking tool call...');
  hook.onToolCall('database-query', 456, 0.0005);

  // Manual flush (also happens automatically)
  console.log('\n=== Flushing to kernel ===');
  try {
    const { receipts, ian } = await hook.flush();

    console.log(`\nSubmitted ${receipts.length} events`);
    console.log(`Total cost: $${ian?.totalCostUsd.toFixed(6)}`);
    console.log(`Period: ${ian?.periodStart} to ${ian?.periodEnd}`);
    console.log(`Signature: ${ian?.signature.substring(0, 20)}...`);
    console.log('\nIAN successfully submitted to kernel!');
  } catch (error) {
    console.error('Failed to submit IAN:', error);
  }
}

main().catch(console.error);
