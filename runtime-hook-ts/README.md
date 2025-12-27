# @primordia/runtime-hook

TypeScript runtime hook for Primordia agent metering. Automatically tracks LLM and tool usage, generates Metering Service Receipts (MSR), and submits Intent Attestation Notices (IAN) to the Primordia kernel.

## Features

- **Shadow Mode**: Local metering only, no network calls
- **Paid Mode**: Automatic batching and submission to kernel
- **Drop-in Wrappers**: OpenAI and Anthropic client wrappers
- **Auto-flushing**: Configurable batch size and intervals
- **Type-safe**: Full TypeScript support

## Installation

```bash
npm install @primordia/runtime-hook
```

## Quick Start

### Shadow Mode (Development)

```typescript
import { createHook, wrapOpenAI } from '@primordia/runtime-hook';
import OpenAI from 'openai';

// Create hook in shadow mode
const hook = createHook({
  agentId: 'agent-dev-001',
  privateKey: 'your-private-key',
  mode: 'shadow',
});

// Wrap OpenAI client
const openai = wrapOpenAI(new OpenAI(), hook);

// Use normally - calls are automatically metered
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
});

// View local receipts
const { receipts } = await hook.flush();
console.log('Metered events:', receipts);
```

### Paid Mode (Production)

```typescript
import { createHook, wrapAnthropic } from '@primordia/runtime-hook';
import Anthropic from '@anthropic-ai/sdk';

// Create hook in paid mode
const hook = createHook({
  agentId: 'agent-prod-001',
  privateKey: process.env.PRIMORDIA_PRIVATE_KEY!,
  mode: 'paid',
  kernelUrl: 'https://kernel.primordia.network',
  flushIntervalMs: 60000, // Auto-flush every 60s
  batchSize: 100, // Auto-flush at 100 events
});

// Wrap Anthropic client
const anthropic = wrapAnthropic(new Anthropic(), hook);

// Use normally - calls are automatically metered and submitted
const response = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});

// Manual flush (automatic in paid mode)
const { receipts, ian } = await hook.flush();
console.log('Submitted IAN:', ian);
```

## Manual Metering

```typescript
// Track LLM calls manually
hook.onLLMCall('gpt-4', 150, 200, 0.015);

// Track tool calls manually
hook.onToolCall('web-search', 1200, 0.001);

// Flush when ready
await hook.flush();
```

## API

### `createHook(config)`

Creates a new Primordia runtime hook.

**Config:**
- `agentId` (string): Your agent identifier
- `privateKey` (string): Private key for signing IANs
- `mode` ('shadow' | 'paid'): Operating mode
- `kernelUrl` (string, optional): Kernel endpoint (default: https://kernel.primordia.network)
- `flushIntervalMs` (number, optional): Auto-flush interval in ms (default: 60000)
- `batchSize` (number, optional): Auto-flush batch size (default: 100)

### `PrimordiaHook`

**Methods:**
- `onLLMCall(model, inputTokens, outputTokens, costUsd)`: Record LLM call
- `onToolCall(tool, durationMs, costUsd)`: Record tool call
- `flush()`: Flush receipts, returns `{ receipts, ian? }`

### Wrappers

- `wrapOpenAI(client, hook)`: Wrap OpenAI client
- `wrapAnthropic(client, hook)`: Wrap Anthropic client

## Types

### MSR (Metering Service Receipt)

```typescript
interface MSR {
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
```

### IAN (Intent Attestation Notice)

```typescript
interface IAN {
  agentId: string;
  periodStart: string;
  periodEnd: string;
  totalCostUsd: number;
  receipts: MSR[];
  signature: string;
  timestamp: string;
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Clean
npm run clean
```

## License

MIT
