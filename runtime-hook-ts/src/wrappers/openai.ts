import { PrimordiaHook } from '../hook';

/**
 * Wraps an OpenAI client to automatically meter LLM calls
 */
export function wrapOpenAI(client: any, hook: PrimordiaHook): any {
  // Store original method
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);

  // Wrap the create method
  client.chat.completions.create = async function(...args: any[]) {
    const startTime = Date.now();

    try {
      const result = await originalCreate(...args);
      const durationMs = Date.now() - startTime;

      // Extract metering data
      const model = result.model || args[0]?.model || 'unknown';
      const inputTokens = result.usage?.prompt_tokens || 0;
      const outputTokens = result.usage?.completion_tokens || 0;

      // Calculate cost (simplified - should use proper pricing)
      const costUsd = calculateOpenAICost(model, inputTokens, outputTokens);

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
 * Calculate cost for OpenAI models
 * Prices as of 2024 - should be updated or pulled from API
 */
function calculateOpenAICost(model: string, inputTokens: number, outputTokens: number): number {
  // Simplified pricing table (USD per 1M tokens)
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 30, output: 60 },
    'gpt-4-turbo': { input: 10, output: 30 },
    'gpt-4o': { input: 5, output: 15 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    'gpt-3.5-turbo-16k': { input: 3, output: 4 },
  };

  // Find matching pricing (fuzzy match)
  let modelPricing = pricing['gpt-4']; // default
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
