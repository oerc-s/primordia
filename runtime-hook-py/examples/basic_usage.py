"""Basic usage example for Primordia Runtime Hook."""

from primordia_runtime_hook import PrimordiaHook


def main():
    # Initialize hook in shadow mode
    hook = PrimordiaHook(
        agent_id="agent-demo-001",
        private_key="0" * 64,  # Dummy key for demo
        mode="shadow"
    )

    print("Primordia Runtime Hook - Basic Usage Example")
    print("=" * 50)

    # Simulate some LLM calls
    print("\n1. Tracking LLM calls...")

    hook.on_llm_call(
        model="gpt-4",
        input_tokens=150,
        output_tokens=75,
        cost_usd=0.00675,
        provider="openai"
    )

    hook.on_llm_call(
        model="claude-3-opus",
        input_tokens=200,
        output_tokens=100,
        cost_usd=0.009,
        provider="anthropic"
    )

    # Simulate some tool calls
    print("2. Tracking tool calls...")

    hook.on_tool_call(
        tool="web_search",
        duration_ms=350,
        cost_usd=0.001,
        query="python async programming"
    )

    hook.on_tool_call(
        tool="database_query",
        duration_ms=125,
        cost_usd=0.0005,
        query_type="SELECT"
    )

    hook.on_tool_call(
        tool="api_call",
        duration_ms=450,
        cost_usd=0.002,
        endpoint="/v1/data"
    )

    # Get current stats
    print("\n3. Current session stats:")
    stats = hook.get_stats()
    print(f"   - Total receipts: {stats['total_receipts']}")
    print(f"   - LLM calls: {stats['llm_calls']}")
    print(f"   - Tool calls: {stats['tool_calls']}")
    print(f"   - Total tokens: {stats['total_tokens']}")
    print(f"   - Total cost: ${stats['total_cost_usd']:.4f}")

    # Flush receipts
    print("\n4. Flushing receipts...")
    result = hook.flush()

    print(f"   - Receipts generated: {result['receipt_count']}")
    print(f"   - Total cost: ${result['total_cost_usd']:.4f}")

    # Show sample receipt
    if result['receipts']:
        print("\n5. Sample receipt (LLM):")
        llm_receipt = next(r for r in result['receipts'] if r['resource_type'] == 'llm_inference')
        print(f"   - Resource: {llm_receipt['resource_type']}")
        print(f"   - Model: {llm_receipt['metadata']['model']}")
        print(f"   - Tokens: {llm_receipt['metadata']['total_tokens']}")
        print(f"   - Cost: ${llm_receipt['cost_usd']:.4f}")
        print(f"   - Hash: {llm_receipt['hash'][:16]}...")

        print("\n6. Sample receipt (Tool):")
        tool_receipt = next(r for r in result['receipts'] if r['resource_type'] == 'tool_execution')
        print(f"   - Resource: {tool_receipt['resource_type']}")
        print(f"   - Tool: {tool_receipt['metadata']['tool']}")
        print(f"   - Duration: {tool_receipt['metadata']['duration_ms']}ms")
        print(f"   - Cost: ${tool_receipt['cost_usd']:.4f}")

    print("\n" + "=" * 50)
    print("Example complete!")


if __name__ == "__main__":
    main()
