/**
 * Metering Service Receipt - local metering event
 */
export interface MSR {
  timestamp: string;
  agentId: string;
  eventType: 'llm_call' | 'tool_call';
  model?: string;
  tool?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  costUsd: number;
}

/**
 * Intent Attestation Notice - signed settlement proof
 */
export interface IAN {
  agentId: string;
  periodStart: string;
  periodEnd: string;
  totalCostUsd: number;
  receipts: MSR[];
  signature: string;
  timestamp: string;
}

/**
 * Configuration for the Primordia runtime hook
 */
export interface PrimordiaConfig {
  agentId: string;
  privateKey: string;
  mode: 'shadow' | 'paid';
  kernelUrl?: string;
  flushIntervalMs?: number;
  batchSize?: number;
}

/**
 * Response from kernel /v1/net endpoint
 */
export interface NetResponse {
  ian: IAN;
  status: 'accepted' | 'rejected';
  message?: string;
}
