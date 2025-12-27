"""OpenAI integration example for Primordia Runtime Hook."""

import os
from primordia_runtime_hook import PrimordiaHook, wrap_openai

# Note: This example requires the openai package
# Install with: pip install openai

try:
    from openai import OpenAI
except ImportError:
    print("This example requires the openai package.")
    print("Install with: pip install openai")
    exit(1)


def main():
    # Check for API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Please set OPENAI_API_KEY environment variable")
        print("Example: export OPENAI_API_KEY='sk-...'")
        exit(1)

    print("Primordia Runtime Hook - OpenAI Integration Example")
    print("=" * 50)

    # Initialize OpenAI client
    client = OpenAI(api_key=api_key)

    # Initialize Primordia hook
    hook = PrimordiaHook(
        agent_id="openai-demo-agent",
        private_key="0" * 64,  # Dummy key for demo
        mode="shadow"
    )

    # Wrap the client to enable automatic tracking
    print("\n1. Wrapping OpenAI client...")
    client = wrap_openai(client, hook)

    # Make some API calls - tracking happens automatically
    print("2. Making API calls (tracking automatically)...")

    print("\n   Call 1: Simple completion")
    response1 = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "user", "content": "What is Python?"}
        ],
        max_tokens=100
    )
    print(f"   Response: {response1.choices[0].message.content[:60]}...")

    print("\n   Call 2: Another completion")
    response2 = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "user", "content": "Explain async/await in one sentence"}
        ],
        max_tokens=50
    )
    print(f"   Response: {response2.choices[0].message.content[:60]}...")

    # Check stats
    print("\n3. Current session stats:")
    stats = hook.get_stats()
    print(f"   - Total LLM calls: {stats['llm_calls']}")
    print(f"   - Total tokens: {stats['total_tokens']}")
    print(f"   - Total cost: ${stats['total_cost_usd']:.4f}")

    # Flush receipts
    print("\n4. Flushing receipts...")
    result = hook.flush()

    print(f"   - Receipts generated: {result['receipt_count']}")
    print(f"   - Total cost: ${result['total_cost_usd']:.4f}")

    # Show receipts
    print("\n5. Generated receipts:")
    for i, receipt in enumerate(result['receipts'], 1):
        meta = receipt['metadata']
        print(f"\n   Receipt {i}:")
        print(f"   - Model: {meta['model']}")
        print(f"   - Input tokens: {meta['input_tokens']}")
        print(f"   - Output tokens: {meta['output_tokens']}")
        print(f"   - Cost: ${receipt['cost_usd']:.6f}")
        print(f"   - Timestamp: {receipt['timestamp']}")

    print("\n" + "=" * 50)
    print("Example complete!")


if __name__ == "__main__":
    main()
