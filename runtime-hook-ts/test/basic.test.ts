/**
 * Basic functionality tests for @primordia/runtime-hook
 */

import { createHook, MSR, IAN } from '../src';

describe('PrimordiaHook', () => {
  describe('Shadow Mode', () => {
    it('should record LLM calls', async () => {
      const hook = createHook({
        agentId: 'test-agent',
        privateKey: 'test-key',
        mode: 'shadow',
      });

      hook.onLLMCall('gpt-4', 100, 200, 0.01);
      hook.onLLMCall('gpt-3.5-turbo', 50, 75, 0.001);

      const { receipts } = await hook.flush();

      expect(receipts).toHaveLength(2);
      expect(receipts[0].eventType).toBe('llm_call');
      expect(receipts[0].model).toBe('gpt-4');
      expect(receipts[0].inputTokens).toBe(100);
      expect(receipts[0].outputTokens).toBe(200);
      expect(receipts[0].costUsd).toBe(0.01);
    });

    it('should record tool calls', async () => {
      const hook = createHook({
        agentId: 'test-agent',
        privateKey: 'test-key',
        mode: 'shadow',
      });

      hook.onToolCall('web-search', 1500, 0.002);

      const { receipts } = await hook.flush();

      expect(receipts).toHaveLength(1);
      expect(receipts[0].eventType).toBe('tool_call');
      expect(receipts[0].tool).toBe('web-search');
      expect(receipts[0].durationMs).toBe(1500);
      expect(receipts[0].costUsd).toBe(0.002);
    });

    it('should return receipts without IAN in shadow mode', async () => {
      const hook = createHook({
        agentId: 'test-agent',
        privateKey: 'test-key',
        mode: 'shadow',
      });

      hook.onLLMCall('gpt-4', 100, 200, 0.01);

      const { receipts, ian } = await hook.flush();

      expect(receipts).toHaveLength(1);
      expect(ian).toBeUndefined();
    });

    it('should clear receipts after flush', async () => {
      const hook = createHook({
        agentId: 'test-agent',
        privateKey: 'test-key',
        mode: 'shadow',
      });

      hook.onLLMCall('gpt-4', 100, 200, 0.01);
      await hook.flush();

      const { receipts } = await hook.flush();
      expect(receipts).toHaveLength(0);
    });
  });

  describe('MSR Structure', () => {
    it('should create valid MSR structure', async () => {
      const hook = createHook({
        agentId: 'test-agent-123',
        privateKey: 'test-key',
        mode: 'shadow',
      });

      hook.onLLMCall('gpt-4', 150, 250, 0.025);

      const { receipts } = await hook.flush();
      const msr = receipts[0];

      expect(msr).toHaveProperty('timestamp');
      expect(msr).toHaveProperty('agentId', 'test-agent-123');
      expect(msr).toHaveProperty('eventType', 'llm_call');
      expect(msr).toHaveProperty('model', 'gpt-4');
      expect(msr).toHaveProperty('inputTokens', 150);
      expect(msr).toHaveProperty('outputTokens', 250);
      expect(msr).toHaveProperty('costUsd', 0.025);
    });
  });
});
