# Quick Start Guide

Get started with Primordia Runtime Hook in 5 minutes.

## Installation

```bash
pip install primordia-runtime-hook
```

## Basic Usage

### 1. Import and Initialize

```python
from primordia_runtime_hook import PrimordiaHook

hook = PrimordiaHook(
    agent_id="your-agent-id",
    private_key="your-private-key",
    mode="shadow"  # or "paid" for network submission
)
```

### 2. Track Usage

```python
# Track LLM calls
hook.on_llm_call(
    model="gpt-4",
    input_tokens=100,
    output_tokens=50,
    cost_usd=0.0045
)

# Track tool executions
hook.on_tool_call(
    tool="web_search",
    duration_ms=250,
    cost_usd=0.001
)
```

### 3. Get Receipts

```python
result = hook.flush()
print(f"Generated {result['receipt_count']} receipts")
print(f"Total cost: ${result['total_cost_usd']:.4f}")
```

## Integration Examples

### OpenAI

```python
from openai import OpenAI
from primordia_runtime_hook import wrap_openai

client = OpenAI()
hook = PrimordiaHook(agent_id="agent-1", private_key="key")
client = wrap_openai(client, hook)

# Use normally - tracking is automatic
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Anthropic

```python
from anthropic import Anthropic
from primordia_runtime_hook import wrap_anthropic

client = Anthropic()
hook = PrimordiaHook(agent_id="agent-1", private_key="key")
client = wrap_anthropic(client, hook)

# Use normally - tracking is automatic
response = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
```

## Running Examples

```bash
# Basic usage example
python examples/basic_usage.py

# OpenAI integration (requires OPENAI_API_KEY)
export OPENAI_API_KEY='sk-...'
python examples/openai_integration.py

# Paid mode (requires running kernel)
python examples/paid_mode.py
```

## Testing

```bash
# Run verification
python verify.py

# Run tests
pip install pytest
pytest tests/
```

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check out [examples/](examples/) for more integration patterns
- Visit [docs.primordia.network](https://docs.primordia.network) for complete guides

## Common Patterns

### Monitor Session Costs

```python
# Get real-time stats
stats = hook.get_stats()
print(f"Current session cost: ${stats['total_cost_usd']:.4f}")
```

### Batch Multiple Operations

```python
# Track multiple operations
for i in range(10):
    hook.on_llm_call(model="gpt-3.5-turbo", ...)

# Flush once at the end
result = hook.flush()
```

### Add Custom Metadata

```python
hook.on_llm_call(
    model="gpt-4",
    input_tokens=100,
    output_tokens=50,
    cost_usd=0.0045,
    session_id="session-123",
    user_id="user-456",
    custom_tag="my-value"
)
```

## Troubleshooting

**Import Error**: Make sure the package is installed:
```bash
pip install primordia-runtime-hook
```

**Missing Dependencies**: Install optional dependencies:
```bash
pip install primordia-runtime-hook[openai]  # For OpenAI
pip install primordia-runtime-hook[anthropic]  # For Anthropic
pip install primordia-runtime-hook[all]  # For all integrations
```

**Paid Mode Not Working**: Ensure the Primordia kernel is running:
```bash
cd clearing-kernel
npm run dev
```

## Support

- GitHub Issues: [github.com/primordia/primordia/issues](https://github.com/primordia/primordia/issues)
- Documentation: [docs.primordia.network](https://docs.primordia.network)
- Discord: [discord.gg/primordia](https://discord.gg/primordia)
