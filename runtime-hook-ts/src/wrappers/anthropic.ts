import { PrimordiaHook } from '../hook';

/**
 * Wraps an Anthropic client to automatically meter LLM calls
 */
export function wrapAnthropic(client: any, hook: PrimordiaHook): any {
  // Store original method
  const originalCreate = client.messages.create.bind(client.messages);

  // Wrap the create method
  client.messages.create = async function(...args: any[]) {
    const startTime = Date.now();

    try {
      const result = await originalCreate(...args);
      const durationMs = Date.now() - startTime;

      // Extract metering data
      const model = result.model || args[0]?.model || 'unknown';
      const inputTokens = result.usage?.input_tokens || 0;
      const outputTokens = result.usage?.output_tokens || 0;

      // Calculate cost
      const costUsd = calculateAnthropicCost(model, inputTokens, outputTokens);

      // Record the call
      hook.onLLMCall(model, inputTokens, outputTokens, costUsd);

      return result;
    } catch (error) {
      // Still record the attempt with zero tokens
      const model = args[0]?.model || 'unknown';
      hook.onLLMCall(model, 0, 0, 0);
      throw error;
    }
  };

  return client;
}

/**
 * Calculate cost for Anthropic models
 * Prices as of 2024 - should be updated or pulled from API
 */
function calculateAnthropicCost(model: string, inputTokens: number, outputTokens: number): number {
  // Simplified pricing table (USD per 1M tokens)
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-3-opus': { input: 15, output: 75 },
    'claude-3-sonnet': { input: 3, output: 15 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    'claude-3-5-sonnet': { input: 3, output: 15 },
    'claude-3-5-haiku': { input: 1, output: 5 },
    'claude-2.1': { input: 8, output: 24 },
    'claude-2.0': { input: 8, output: 24 },
    'claude-instant-1.2': { input: 0.8, output: 2.4 },
  };

  // Find matching pricing (fuzzy match)
  let modelPricing = pricing['claude-3-sonnet']; // default
  for (const [key, value] of Object.entries(pricing)) {
    if (model.includes(key)) {
      modelPricing = value;
      break;
    }
  }

  const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
}
