import { MSR, IAN, PrimordiaConfig, NetResponse } from './types';

/**
 * PrimordiaHook - Core metering hook
 */
export interface PrimordiaHook {
  onLLMCall(model: string, inputTokens: number, outputTokens: number, costUsd: number): void;
  onToolCall(tool: string, durationMs: number, costUsd: number): void;
  flush(): Promise<{ receipts: MSR[], ian?: IAN }>;
}

export class PrimordiaHookImpl implements PrimordiaHook {
  private receipts: MSR[] = [];
  private config: Required<PrimordiaConfig>;

  constructor(config: PrimordiaConfig) {
    this.config = {
      ...config,
      kernelUrl: config.kernelUrl || 'https://kernel.primordia.network',
      flushIntervalMs: config.flushIntervalMs || 60000,
      batchSize: config.batchSize || 100,
    };

    // Auto-flush periodically
    if (this.config.mode === 'paid') {
      setInterval(() => this.flush(), this.config.flushIntervalMs);
    }
  }

  onLLMCall(model: string, inputTokens: number, outputTokens: number, costUsd: number): void {
    const msr: MSR = {
      timestamp: new Date().toISOString(),
      agentId: this.config.agentId,
      eventType: 'llm_call',
      model,
      inputTokens,
      outputTokens,
      costUsd,
    };

    this.receipts.push(msr);

    // Auto-flush if batch size reached in paid mode
    if (this.config.mode === 'paid' && this.receipts.length >= this.config.batchSize) {
      this.flush().catch(err => console.error('[Primordia] Auto-flush failed:', err));
    }
  }

  onToolCall(tool: string, durationMs: number, costUsd: number): void {
    const msr: MSR = {
      timestamp: new Date().toISOString(),
      agentId: this.config.agentId,
      eventType: 'tool_call',
      tool,
      durationMs,
      costUsd,
    };

    this.receipts.push(msr);

    // Auto-flush if batch size reached in paid mode
    if (this.config.mode === 'paid' && this.receipts.length >= this.config.batchSize) {
      this.flush().catch(err => console.error('[Primordia] Auto-flush failed:', err));
    }
  }

  async flush(): Promise<{ receipts: MSR[], ian?: IAN }> {
    if (this.receipts.length === 0) {
      return { receipts: [] };
    }

    const receiptsToFlush = [...this.receipts];
    this.receipts = [];

    if (this.config.mode === 'shadow') {
      // Shadow mode: just emit locally, no network call
      console.log('[Primordia Shadow]', JSON.stringify(receiptsToFlush, null, 2));
      return { receipts: receiptsToFlush };
    }

    // Paid mode: create IAN and send to kernel
    const ian = await this.createIAN(receiptsToFlush);

    try {
      const response = await fetch(`${this.config.kernelUrl}/v1/net`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ian),
      });

      if (!response.ok) {
        throw new Error(`Kernel returned ${response.status}: ${await response.text()}`);
      }

      const result = await response.json() as NetResponse;

      if (result.status === 'rejected') {
        console.error('[Primordia] IAN rejected:', result.message);
      }

      return { receipts: receiptsToFlush, ian };
    } catch (error) {
      console.error('[Primordia] Failed to send IAN:', error);
      // Re-queue receipts on failure
      this.receipts.unshift(...receiptsToFlush);
      throw error;
    }
  }

  private async createIAN(receipts: MSR[]): Promise<IAN> {
    const now = new Date().toISOString();
    const periodStart = receipts[0]?.timestamp || now;
    const periodEnd = receipts[receipts.length - 1]?.timestamp || now;
    const totalCostUsd = receipts.reduce((sum, r) => sum + r.costUsd, 0);

    // Create message to sign
    const message = JSON.stringify({
      agentId: this.config.agentId,
      periodStart,
      periodEnd,
      totalCostUsd,
      receiptsCount: receipts.length,
      timestamp: now,
    });

    // Sign using crypto-core (to be imported)
    const signature = await this.signMessage(message);

    return {
      agentId: this.config.agentId,
      periodStart,
      periodEnd,
      totalCostUsd,
      receipts,
      signature,
      timestamp: now,
    };
  }

  private async signMessage(message: string): Promise<string> {
    // TODO: Import and use @primordia/crypto-core for signing
    // For now, placeholder that uses the privateKey
    // In production: return await sign(this.config.privateKey, message);

    // Placeholder signature (base64 encoded)
    const encoder = new TextEncoder();
    const data = encoder.encode(message + this.config.privateKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return Buffer.from(hashArray).toString('base64');
  }
}

export function createHook(config: PrimordiaConfig): PrimordiaHook {
  return new PrimordiaHookImpl(config);
}
