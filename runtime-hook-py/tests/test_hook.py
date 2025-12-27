"""Tests for PrimordiaHook."""

import pytest
from primordia_runtime_hook import PrimordiaHook


class TestPrimordiaHook:
    """Test PrimordiaHook class."""

    def test_init_shadow_mode(self):
        """Test initialization in shadow mode."""
        hook = PrimordiaHook(
            agent_id="test-agent",
            private_key="0" * 64,
            mode="shadow"
        )

        assert hook.agent_id == "test-agent"
        assert hook.mode == "shadow"
        assert len(hook.receipts) == 0
        assert hook.total_cost_usd == 0.0

    def test_on_llm_call(self):
        """Test tracking LLM calls."""
        hook = PrimordiaHook(
            agent_id="test-agent",
            private_key="0" * 64,
            mode="shadow"
        )

        msr = hook.on_llm_call(
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.0045
        )

        assert len(hook.receipts) == 1
        assert hook.total_cost_usd == 0.0045
        assert msr["resource_type"] == "llm_inference"
        assert msr["metadata"]["model"] == "gpt-4"
        assert msr["metadata"]["input_tokens"] == 100
        assert msr["metadata"]["output_tokens"] == 50
        assert msr["metadata"]["total_tokens"] == 150
        assert "hash" in msr

    def test_on_tool_call(self):
        """Test tracking tool calls."""
        hook = PrimordiaHook(
            agent_id="test-agent",
            private_key="0" * 64,
            mode="shadow"
        )

        msr = hook.on_tool_call(
            tool="web_search",
            duration_ms=250,
            cost_usd=0.001
        )

        assert len(hook.receipts) == 1
        assert hook.total_cost_usd == 0.001
        assert msr["resource_type"] == "tool_execution"
        assert msr["metadata"]["tool"] == "web_search"
        assert msr["metadata"]["duration_ms"] == 250
        assert "hash" in msr

    def test_multiple_receipts(self):
        """Test tracking multiple receipts."""
        hook = PrimordiaHook(
            agent_id="test-agent",
            private_key="0" * 64,
            mode="shadow"
        )

        hook.on_llm_call(
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.0045
        )

        hook.on_tool_call(
            tool="web_search",
            duration_ms=250,
            cost_usd=0.001
        )

        hook.on_llm_call(
            model="claude-3",
            input_tokens=150,
            output_tokens=75,
            cost_usd=0.00675
        )

        assert len(hook.receipts) == 3
        assert hook.total_cost_usd == 0.01225

    def test_get_stats(self):
        """Test getting session statistics."""
        hook = PrimordiaHook(
            agent_id="test-agent",
            private_key="0" * 64,
            mode="shadow"
        )

        hook.on_llm_call(
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.0045
        )

        hook.on_tool_call(
            tool="web_search",
            duration_ms=250,
            cost_usd=0.001
        )

        stats = hook.get_stats()

        assert stats["total_receipts"] == 2
        assert stats["llm_calls"] == 1
        assert stats["tool_calls"] == 1
        assert stats["total_cost_usd"] == 0.0055
        assert stats["total_tokens"] == 150

    def test_flush_shadow_mode(self):
        """Test flushing receipts in shadow mode."""
        hook = PrimordiaHook(
            agent_id="test-agent",
            private_key="0" * 64,
            mode="shadow"
        )

        hook.on_llm_call(
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.0045
        )

        result = hook.flush()

        assert result["receipt_count"] == 1
        assert result["total_cost_usd"] == 0.0045
        assert len(result["receipts"]) == 1
        assert "ian" not in result  # No IAN in shadow mode

        # Receipts should be cleared after flush
        assert len(hook.receipts) == 0
        assert hook.total_cost_usd == 0.0

    def test_custom_metadata(self):
        """Test adding custom metadata to receipts."""
        hook = PrimordiaHook(
            agent_id="test-agent",
            private_key="0" * 64,
            mode="shadow"
        )

        msr = hook.on_llm_call(
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.0045,
            custom_field="custom_value",
            session_id="session-123"
        )

        assert msr["metadata"]["custom_field"] == "custom_value"
        assert msr["metadata"]["session_id"] == "session-123"

    def test_receipt_hash_integrity(self):
        """Test that receipt hashes are unique and consistent."""
        hook = PrimordiaHook(
            agent_id="test-agent",
            private_key="0" * 64,
            mode="shadow"
        )

        msr1 = hook.on_llm_call(
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.0045
        )

        msr2 = hook.on_llm_call(
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.0045
        )

        # Different receipts should have different hashes
        # (due to different timestamps)
        assert msr1["hash"] != msr2["hash"]

        # Hash should be present and valid hex
        assert len(msr1["hash"]) == 64
        assert all(c in "0123456789abcdef" for c in msr1["hash"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
