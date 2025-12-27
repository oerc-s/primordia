/**
 * Example: Shadow mode usage
 *
 * Shadow mode emits MSRs locally without network calls.
 * Ideal for development and testing.
 */

import { createHook, wrapOpenAI } from '@primordia/runtime-hook';
import OpenAI from 'openai';

async function main() {
  // Create hook in shadow mode
  const hook = createHook({
    agentId: 'agent-dev-001',
    privateKey: 'dev-key-12345', // Not used in shadow mode
    mode: 'shadow',
  });

  // Wrap OpenAI client
  const openai = wrapOpenAI(new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }), hook);

  // Make some LLM calls - automatically metered
  console.log('Making LLM call 1...');
  const response1 = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'user', content: 'What is the capital of France?' }
    ],
  });
  console.log('Response:', response1.choices[0].message.content);

  console.log('\nMaking LLM call 2...');
  const response2 = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Explain quantum computing in one sentence.' }
    ],
  });
  console.log('Response:', response2.choices[0].message.content);

  // Manually track a tool call
  console.log('\nTracking manual tool call...');
  hook.onToolCall('web-search', 1234, 0.001);

  // Flush and view receipts
  console.log('\n=== Flushing receipts ===');
  const { receipts } = await hook.flush();

  console.log(`\nRecorded ${receipts.length} events:`);
  receipts.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.eventType}:`);
    console.log(`   Agent: ${r.agentId}`);
    console.log(`   Timestamp: ${r.timestamp}`);
    if (r.model) console.log(`   Model: ${r.model}`);
    if (r.tool) console.log(`   Tool: ${r.tool}`);
    if (r.inputTokens) console.log(`   Input: ${r.inputTokens} tokens`);
    if (r.outputTokens) console.log(`   Output: ${r.outputTokens} tokens`);
    console.log(`   Cost: $${r.costUsd.toFixed(6)}`);
  });

  const totalCost = receipts.reduce((sum, r) => sum + r.costUsd, 0);
  console.log(`\nTotal cost: $${totalCost.toFixed(6)}`);
}

main().catch(console.error);
