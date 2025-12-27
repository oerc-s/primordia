#!/usr/bin/env python3
"""Verification script for primordia-runtime-hook package."""

import sys
import os

# Add current directory to path for testing
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from primordia_runtime_hook import PrimordiaHook, __version__


def test_basic_functionality():
    """Test basic hook functionality."""
    print("Testing Primordia Runtime Hook v" + __version__)
    print("=" * 60)

    # Create hook
    print("\n1. Creating PrimordiaHook in shadow mode...")
    hook = PrimordiaHook(
        agent_id="verify-agent",
        private_key="0" * 64,
        mode="shadow"
    )
    print("   [OK] Hook created successfully")

    # Test LLM call tracking
    print("\n2. Testing LLM call tracking...")
    msr = hook.on_llm_call(
        model="gpt-4",
        input_tokens=100,
        output_tokens=50,
        cost_usd=0.0045
    )
    assert msr["resource_type"] == "llm_inference"
    assert msr["metadata"]["model"] == "gpt-4"
    assert msr["metadata"]["total_tokens"] == 150
    assert "hash" in msr
    print("   [OK] LLM call tracked successfully")
    print(f"     - Model: {msr['metadata']['model']}")
    print(f"     - Tokens: {msr['metadata']['total_tokens']}")
    print(f"     - Hash: {msr['hash'][:16]}...")

    # Test tool call tracking
    print("\n3. Testing tool call tracking...")
    msr = hook.on_tool_call(
        tool="web_search",
        duration_ms=250,
        cost_usd=0.001
    )
    assert msr["resource_type"] == "tool_execution"
    assert msr["metadata"]["tool"] == "web_search"
    assert msr["metadata"]["duration_ms"] == 250
    print("   [OK] Tool call tracked successfully")
    print(f"     - Tool: {msr['metadata']['tool']}")
    print(f"     - Duration: {msr['metadata']['duration_ms']}ms")

    # Test stats
    print("\n4. Testing stats...")
    stats = hook.get_stats()
    assert stats["total_receipts"] == 2
    assert stats["llm_calls"] == 1
    assert stats["tool_calls"] == 1
    assert stats["total_tokens"] == 150
    print("   [OK] Stats retrieved successfully")
    print(f"     - Total receipts: {stats['total_receipts']}")
    print(f"     - LLM calls: {stats['llm_calls']}")
    print(f"     - Tool calls: {stats['tool_calls']}")
    print(f"     - Total cost: ${stats['total_cost_usd']:.4f}")

    # Test flush
    print("\n5. Testing flush...")
    result = hook.flush()
    assert result["receipt_count"] == 2
    assert len(result["receipts"]) == 2
    assert len(hook.receipts) == 0  # Should be cleared
    print("   [OK] Flush successful")
    print(f"     - Receipts flushed: {result['receipt_count']}")
    print(f"     - Total cost: ${result['total_cost_usd']:.4f}")

    print("\n" + "=" * 60)
    print("[OK] All tests passed!")
    print("\nPackage is working correctly and ready to use.")
    return True


def main():
    """Run verification tests."""
    try:
        success = test_basic_functionality()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n[ERROR] Error during verification: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
