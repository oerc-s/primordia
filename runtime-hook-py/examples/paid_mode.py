"""Paid mode example for Primordia Runtime Hook."""

from primordia_runtime_hook import PrimordiaHook


def main():
    print("Primordia Runtime Hook - Paid Mode Example")
    print("=" * 50)

    # Initialize hook in paid mode
    # Note: This requires a running Primordia kernel
    hook = PrimordiaHook(
        agent_id="paid-demo-agent",
        private_key="0" * 64,  # Replace with real private key
        mode="paid",
        kernel_url="http://localhost:4729"
    )

    print("\n1. Tracking usage in paid mode...")

    # Simulate some work
    hook.on_llm_call(
        model="gpt-4",
        input_tokens=200,
        output_tokens=150,
        cost_usd=0.0105
    )

    hook.on_tool_call(
        tool="web_search",
        duration_ms=300,
        cost_usd=0.001
    )

    hook.on_llm_call(
        model="claude-3-opus",
        input_tokens=150,
        output_tokens=100,
        cost_usd=0.0075
    )

    # Get stats before flush
    print("\n2. Session stats before flush:")
    stats = hook.get_stats()
    print(f"   - Total receipts: {stats['total_receipts']}")
    print(f"   - Total cost: ${stats['total_cost_usd']:.4f}")

    # Flush and get IAN
    print("\n3. Flushing to kernel (will submit for IAN)...")

    try:
        result = hook.flush()

        if 'error' in result:
            print(f"\n   Error: {result['error']}")
            print("   Make sure Primordia kernel is running at http://localhost:4729")
        elif 'ian' in result:
            print("\n   Success! IAN received:")
            ian = result['ian']
            print(f"   - IAN ID: {ian.get('id', 'N/A')}")
            print(f"   - Status: {ian.get('status', 'N/A')}")
            print(f"   - Receipt count: {result['receipt_count']}")
            print(f"   - Total cost: ${result['total_cost_usd']:.4f}")
        else:
            print("\n   Receipts flushed (no IAN in response)")
            print(f"   - Receipt count: {result['receipt_count']}")
            print(f"   - Total cost: ${result['total_cost_usd']:.4f}")

    except Exception as e:
        print(f"\n   Error during flush: {e}")
        print("   Make sure:")
        print("   1. Primordia kernel is running")
        print("   2. Kernel URL is correct")
        print("   3. Private key is valid")

    print("\n" + "=" * 50)
    print("Example complete!")
    print("\nNote: This example requires a running Primordia kernel.")
    print("Start the kernel with: cd clearing-kernel && npm run dev")


if __name__ == "__main__":
    main()
