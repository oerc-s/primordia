"""
Primordia Runtime Hook - Track LLM and tool usage with MSR generation.

Shadow mode: Emits MSR locally, no network
Paid mode: Batches and calls /v1/net for signed IAN
"""

import hashlib
import json
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

try:
    import requests
except ImportError:
    requests = None

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.backends import default_backend
except ImportError:
    ec = None
    hashes = None
    serialization = None
    default_backend = None


__version__ = "0.1.0"
__all__ = ["PrimordiaHook", "wrap_openai", "wrap_anthropic", "wrap_langchain"]


class PrimordiaHook:
    """
    Runtime hook for tracking LLM and tool usage in Primordia network.

    Args:
        agent_id: Unique identifier for the agent
        private_key: Private key for signing (PEM format or hex string)
        mode: 'shadow' (local MSR only) or 'paid' (network submission with IAN)
        kernel_url: URL of Primordia kernel (required for 'paid' mode)
    """

    def __init__(
        self,
        agent_id: str,
        private_key: str,
        mode: str = "shadow",
        kernel_url: Optional[str] = None,
    ):
        self.agent_id = agent_id
        self.private_key = private_key
        self.mode = mode
        self.kernel_url = kernel_url or "http://localhost:4729"

        if mode == "paid" and requests is None:
            raise ImportError("requests library required for 'paid' mode. Install with: pip install requests")

        if mode == "paid" and ec is None:
            raise ImportError("cryptography library required for 'paid' mode. Install with: pip install cryptography")

        # Receipt storage
        self.receipts: List[Dict[str, Any]] = []
        self.total_cost_usd = 0.0

        # Load private key for signing
        self._signing_key = None
        if mode == "paid":
            self._load_signing_key()

    def _load_signing_key(self):
        """Load private key for signing."""
        if ec is None:
            raise ImportError("cryptography library required for signing")

        try:
            # Try PEM format first
            if self.private_key.startswith("-----BEGIN"):
                self._signing_key = serialization.load_pem_private_key(
                    self.private_key.encode(),
                    password=None,
                    backend=default_backend()
                )
            else:
                # Try hex format
                key_bytes = bytes.fromhex(self.private_key)
                self._signing_key = ec.derive_private_key(
                    int.from_bytes(key_bytes, "big"),
                    ec.SECP256K1(),
                    default_backend()
                )
        except Exception as e:
            raise ValueError(f"Failed to load private key: {e}")

    def _create_msr(
        self,
        resource_type: str,
        metadata: Dict[str, Any],
        cost_usd: float,
    ) -> Dict[str, Any]:
        """Create a Metered Service Receipt (MSR)."""
        timestamp = datetime.utcnow().isoformat() + "Z"

        msr = {
            "agent_id": self.agent_id,
            "resource_type": resource_type,
            "timestamp": timestamp,
            "metadata": metadata,
            "cost_usd": cost_usd,
            "mode": self.mode,
        }

        # Add hash for integrity
        msr_json = json.dumps(msr, sort_keys=True)
        msr["hash"] = hashlib.sha256(msr_json.encode()).hexdigest()

        return msr

    def _sign_data(self, data: str) -> str:
        """Sign data with private key."""
        if self._signing_key is None:
            raise ValueError("Signing key not loaded")

        signature = self._signing_key.sign(
            data.encode(),
            ec.ECDSA(hashes.SHA256())
        )
        return signature.hex()

    def on_llm_call(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Track an LLM inference call.

        Args:
            model: Model name/identifier
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            cost_usd: Cost in USD
            **kwargs: Additional metadata

        Returns:
            The created MSR
        """
        metadata = {
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            **kwargs,
        }

        msr = self._create_msr("llm_inference", metadata, cost_usd)
        self.receipts.append(msr)
        self.total_cost_usd += cost_usd

        return msr

    def on_tool_call(
        self,
        tool: str,
        duration_ms: int,
        cost_usd: float,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Track a tool execution.

        Args:
            tool: Tool name/identifier
            duration_ms: Execution duration in milliseconds
            cost_usd: Cost in USD
            **kwargs: Additional metadata

        Returns:
            The created MSR
        """
        metadata = {
            "tool": tool,
            "duration_ms": duration_ms,
            **kwargs,
        }

        msr = self._create_msr("tool_execution", metadata, cost_usd)
        self.receipts.append(msr)
        self.total_cost_usd += cost_usd

        return msr

    def flush(self) -> Dict[str, Any]:
        """
        Flush receipts and get IAN (Invoice Acknowledgment Notice) in paid mode.

        Returns:
            Dict with 'receipts' and optionally 'ian' (in paid mode)
        """
        result = {
            "receipts": self.receipts.copy(),
            "total_cost_usd": self.total_cost_usd,
            "receipt_count": len(self.receipts),
        }

        if self.mode == "paid" and self.receipts:
            try:
                ian = self._submit_to_kernel()
                result["ian"] = ian
            except Exception as e:
                result["error"] = str(e)

        # Clear receipts after flush
        self.receipts.clear()
        self.total_cost_usd = 0.0

        return result

    def _submit_to_kernel(self) -> Dict[str, Any]:
        """Submit receipts to kernel and get IAN."""
        if requests is None:
            raise ImportError("requests library required for kernel submission")

        # Prepare payload
        payload = {
            "agent_id": self.agent_id,
            "receipts": self.receipts,
            "total_cost_usd": self.total_cost_usd,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        # Sign payload
        payload_json = json.dumps(payload, sort_keys=True)
        signature = self._sign_data(payload_json)

        # Submit to kernel
        response = requests.post(
            f"{self.kernel_url}/v1/net",
            json={
                "payload": payload,
                "signature": signature,
            },
            timeout=30,
        )
        response.raise_for_status()

        return response.json()

    def get_stats(self) -> Dict[str, Any]:
        """Get current session statistics."""
        llm_receipts = [r for r in self.receipts if r["resource_type"] == "llm_inference"]
        tool_receipts = [r for r in self.receipts if r["resource_type"] == "tool_execution"]

        return {
            "total_receipts": len(self.receipts),
            "llm_calls": len(llm_receipts),
            "tool_calls": len(tool_receipts),
            "total_cost_usd": self.total_cost_usd,
            "total_tokens": sum(
                r["metadata"].get("total_tokens", 0) for r in llm_receipts
            ),
        }


def wrap_openai(client, hook: PrimordiaHook):
    """
    Wrap OpenAI client to automatically track usage.

    Args:
        client: OpenAI client instance
        hook: PrimordiaHook instance

    Returns:
        Wrapped client
    """
    try:
        import openai
    except ImportError:
        raise ImportError("openai library required. Install with: pip install openai")

    original_create = client.chat.completions.create

    def tracked_create(*args, **kwargs):
        start_time = time.time()
        response = original_create(*args, **kwargs)
        duration_ms = int((time.time() - start_time) * 1000)

        # Extract usage info
        if hasattr(response, "usage") and response.usage:
            model = kwargs.get("model", response.model)
            input_tokens = response.usage.prompt_tokens
            output_tokens = response.usage.completion_tokens

            # Estimate cost (rough approximation)
            cost_usd = (input_tokens * 0.00001 + output_tokens * 0.00003)

            hook.on_llm_call(
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                duration_ms=duration_ms,
            )

        return response

    client.chat.completions.create = tracked_create
    return client


def wrap_anthropic(client, hook: PrimordiaHook):
    """
    Wrap Anthropic client to automatically track usage.

    Args:
        client: Anthropic client instance
        hook: PrimordiaHook instance

    Returns:
        Wrapped client
    """
    try:
        import anthropic
    except ImportError:
        raise ImportError("anthropic library required. Install with: pip install anthropic")

    original_create = client.messages.create

    def tracked_create(*args, **kwargs):
        start_time = time.time()
        response = original_create(*args, **kwargs)
        duration_ms = int((time.time() - start_time) * 1000)

        # Extract usage info
        if hasattr(response, "usage") and response.usage:
            model = kwargs.get("model", response.model)
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens

            # Estimate cost (rough approximation)
            cost_usd = (input_tokens * 0.00001 + output_tokens * 0.00003)

            hook.on_llm_call(
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                duration_ms=duration_ms,
            )

        return response

    client.messages.create = tracked_create
    return client


def wrap_langchain(llm, hook: PrimordiaHook):
    """
    Wrap LangChain LLM to automatically track usage.

    Args:
        llm: LangChain LLM instance
        hook: PrimordiaHook instance

    Returns:
        Wrapped LLM
    """
    try:
        from langchain.callbacks.base import BaseCallbackHandler
    except ImportError:
        raise ImportError("langchain library required. Install with: pip install langchain")

    class PrimordiaCallback(BaseCallbackHandler):
        def __init__(self, hook: PrimordiaHook):
            self.hook = hook
            self.start_time = None

        def on_llm_start(self, serialized, prompts, **kwargs):
            self.start_time = time.time()

        def on_llm_end(self, response, **kwargs):
            if self.start_time:
                duration_ms = int((time.time() - self.start_time) * 1000)

                # Extract token usage if available
                llm_output = response.llm_output or {}
                token_usage = llm_output.get("token_usage", {})

                if token_usage:
                    input_tokens = token_usage.get("prompt_tokens", 0)
                    output_tokens = token_usage.get("completion_tokens", 0)
                    cost_usd = (input_tokens * 0.00001 + output_tokens * 0.00003)

                    self.hook.on_llm_call(
                        model=llm_output.get("model_name", "unknown"),
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        cost_usd=cost_usd,
                        duration_ms=duration_ms,
                    )

    # Add callback to LLM
    if hasattr(llm, "callbacks"):
        if llm.callbacks is None:
            llm.callbacks = []
        llm.callbacks.append(PrimordiaCallback(hook))

    return llm
