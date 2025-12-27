/**
 * Example: Manual metering
 *
 * Track LLM and tool calls manually without client wrappers.
 */

import { createHook, MSR } from '@primordia/runtime-hook';

async function main() {
  const hook = createHook({
    agentId: 'agent-manual-001',
    privateKey: 'manual-key-123',
    mode: 'shadow',
  });

  // Simulate some LLM calls
  console.log('Recording manual LLM calls...');

  hook.onLLMCall('gpt-4', 150, 200, 0.015);
  hook.onLLMCall('gpt-3.5-turbo', 100, 150, 0.0004);
  hook.onLLMCall('claude-3-opus', 500, 750, 0.045);

  // Simulate tool calls
  console.log('Recording tool calls...');

  hook.onToolCall('web-search', 1200, 0.001);
  hook.onToolCall('database-query', 450, 0.0005);
  hook.onToolCall('file-read', 100, 0.0001);
  hook.onToolCall('api-call', 2000, 0.002);

  // Flush and analyze
  const { receipts } = await hook.flush();

  console.log('\n=== Metering Report ===\n');

  // Group by event type
  const llmCalls = receipts.filter(r => r.eventType === 'llm_call');
  const toolCalls = receipts.filter(r => r.eventType === 'tool_call');

  console.log(`LLM Calls: ${llmCalls.length}`);
  llmCalls.forEach(r => {
    console.log(`  - ${r.model}: ${r.inputTokens}→${r.outputTokens} tokens, $${r.costUsd}`);
  });

  console.log(`\nTool Calls: ${toolCalls.length}`);
  toolCalls.forEach(r => {
    console.log(`  - ${r.tool}: ${r.durationMs}ms, $${r.costUsd}`);
  });

  const llmCost = llmCalls.reduce((sum, r) => sum + r.costUsd, 0);
  const toolCost = toolCalls.reduce((sum, r) => sum + r.costUsd, 0);
  const totalCost = llmCost + toolCost;

  console.log('\n=== Cost Breakdown ===');
  console.log(`LLM: $${llmCost.toFixed(6)}`);
  console.log(`Tools: $${toolCost.toFixed(6)}`);
  console.log(`Total: $${totalCost.toFixed(6)}`);
}

main().catch(console.error);
