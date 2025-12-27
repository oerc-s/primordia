# Primordia Runtime Hook (Python)

Python runtime hook for tracking LLM and tool usage with MSR (Metered Service Receipt) generation in the Primordia network.

## Features

- **Shadow Mode**: Emit MSRs locally without network submission
- **Paid Mode**: Batch MSRs and submit to Primordia kernel for signed IAN (Invoice Acknowledgment Notice)
- **Drop-in Wrappers**: Easy integration with OpenAI, Anthropic, and LangChain
- **Automatic Tracking**: Track LLM calls and tool executions automatically
- **Cost Tracking**: Monitor costs in real-time

## Installation

```bash
pip install primordia-runtime-hook
```

### With optional dependencies:

```bash
# For OpenAI integration
pip install primordia-runtime-hook[openai]

# For Anthropic integration
pip install primordia-runtime-hook[anthropic]

# For LangChain integration
pip install primordia-runtime-hook[langchain]

# Install all integrations
pip install primordia-runtime-hook[all]
```

## Quick Start

### Shadow Mode (Local MSR only)

```python
from primordia_runtime_hook import PrimordiaHook

# Initialize hook in shadow mode
hook = PrimordiaHook(
    agent_id="agent-123",
    private_key="your-private-key",
    mode="shadow"
)

# Track LLM calls
hook.on_llm_call(
    model="gpt-4",
    input_tokens=100,
    output_tokens=50,
    cost_usd=0.0045
)

# Track tool calls
hook.on_tool_call(
    tool="web_search",
    duration_ms=250,
    cost_usd=0.001
)

# Get receipts
result = hook.flush()
print(f"Generated {result['receipt_count']} receipts")
print(f"Total cost: ${result['total_cost_usd']:.4f}")
```

### Paid Mode (Network Submission)

```python
from primordia_runtime_hook import PrimordiaHook

# Initialize hook in paid mode
hook = PrimordiaHook(
    agent_id="agent-123",
    private_key="your-private-key",
    mode="paid",
    kernel_url="http://localhost:4729"
)

# Track usage...
hook.on_llm_call(...)

# Flush and get IAN
result = hook.flush()
if "ian" in result:
    print(f"IAN received: {result['ian']}")
```

## Integration Examples

### OpenAI

```python
from openai import OpenAI
from primordia_runtime_hook import PrimordiaHook, wrap_openai

client = OpenAI(api_key="your-api-key")
hook = PrimordiaHook(agent_id="agent-123", private_key="key", mode="shadow")

# Wrap client to auto-track
client = wrap_openai(client, hook)

# Use normally - tracking happens automatically
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)

# Get stats
stats = hook.get_stats()
print(f"Total LLM calls: {stats['llm_calls']}")
print(f"Total tokens: {stats['total_tokens']}")
```

### Anthropic

```python
from anthropic import Anthropic
from primordia_runtime_hook import PrimordiaHook, wrap_anthropic

client = Anthropic(api_key="your-api-key")
hook = PrimordiaHook(agent_id="agent-123", private_key="key", mode="shadow")

# Wrap client to auto-track
client = wrap_anthropic(client, hook)

# Use normally - tracking happens automatically
response = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)

# Flush receipts
result = hook.flush()
```

### LangChain

```python
from langchain.llms import OpenAI
from primordia_runtime_hook import PrimordiaHook, wrap_langchain

llm = OpenAI(temperature=0.7)
hook = PrimordiaHook(agent_id="agent-123", private_key="key", mode="shadow")

# Wrap LLM to auto-track
llm = wrap_langchain(llm, hook)

# Use normally - tracking happens automatically
response = llm("Tell me a joke")

# Get stats
stats = hook.get_stats()
```

## API Reference

### PrimordiaHook

```python
hook = PrimordiaHook(
    agent_id: str,           # Unique agent identifier
    private_key: str,        # Private key (PEM or hex)
    mode: str = "shadow",    # "shadow" or "paid"
    kernel_url: str = None   # Kernel URL (required for paid mode)
)
```

#### Methods

- `on_llm_call(model, input_tokens, output_tokens, cost_usd, **kwargs)` - Track LLM inference
- `on_tool_call(tool, duration_ms, cost_usd, **kwargs)` - Track tool execution
- `flush()` - Flush receipts and get IAN (paid mode)
- `get_stats()` - Get current session statistics

### Wrapper Functions

- `wrap_openai(client, hook)` - Wrap OpenAI client
- `wrap_anthropic(client, hook)` - Wrap Anthropic client
- `wrap_langchain(llm, hook)` - Wrap LangChain LLM

## MSR Structure

Each MSR (Metered Service Receipt) contains:

```python
{
    "agent_id": "agent-123",
    "resource_type": "llm_inference",  # or "tool_execution"
    "timestamp": "2024-01-15T10:30:00Z",
    "metadata": {
        "model": "gpt-4",
        "input_tokens": 100,
        "output_tokens": 50,
        "total_tokens": 150
    },
    "cost_usd": 0.0045,
    "mode": "shadow",
    "hash": "abc123..."
}
```

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Format code
black .
isort .

# Lint
ruff check .
```

## License

MIT

## Links

- [Documentation](https://docs.primordia.network)
- [GitHub](https://github.com/primordia/primordia)
- [Website](https://primordia.network)
