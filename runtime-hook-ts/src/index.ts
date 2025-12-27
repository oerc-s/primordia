/**
 * @primordia/runtime-hook
 *
 * TypeScript runtime hook for Primordia agent metering
 *
 * Shadow mode: emits MSR locally, no network
 * Paid mode: batches and calls /v1/net for signed IAN
 */

export { PrimordiaHook, createHook } from './hook';
export { wrapOpenAI } from './wrappers/openai';
export { wrapAnthropic } from './wrappers/anthropic';
export { MSR, IAN, PrimordiaConfig, NetResponse } from './types';

// Re-export for convenience
export type { PrimordiaHook as Hook } from './hook';
