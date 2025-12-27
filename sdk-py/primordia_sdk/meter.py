"""
Metering utilities for creating attested metering records (AMR).
Provides convenience functions for common metering scenarios.
"""

from typing import Optional
import time

from .amr import (
    AMR,
    make_amr,
    ResourceClass,
    AttestationMethod,
)
from .crypto import hash_bytes
from .canonical import canonicalize_bytes


def make_compute_meter(
    consumer_agent_id: str,
    provider_agent_id: str,
    resource_subtype: str,
    quantity: int,
    unit: str,
    start_ms: int,
    end_ms: int,
    rate_micros_per_unit: int,
    request_hash: str,
    response_hash: str,
    provider_private_key: str,
    attestation_method: AttestationMethod = "SIGNED_METER",
    meter_id: Optional[str] = None,
    session_id: Optional[str] = None,
    parent_amr_id: Optional[str] = None,
) -> AMR:
    """
    Create an attested metering record for compute resources.

    This is a convenience wrapper around make_amr() specifically for compute resources
    (CPU, GPU, inference tokens, etc.).

    Args:
        consumer_agent_id: Agent consuming the resource
        provider_agent_id: Agent providing the resource
        resource_subtype: Specific resource (e.g., "gpt-4o", "gpu_h100", "cpu_vcpu")
        quantity: Amount of resource consumed
        unit: Unit of measurement (e.g., "tokens_1k", "gpu_seconds", "vcpu_hours")
        start_ms: Start timestamp in milliseconds
        end_ms: End timestamp in milliseconds
        rate_micros_per_unit: Price in USD micros per unit
        request_hash: Hash of the request that triggered consumption
        response_hash: Hash of the response produced
        provider_private_key: Private key for signing the AMR
        attestation_method: How consumption is attested (default: SIGNED_METER)
        meter_id: Optional meter identifier
        session_id: Optional session identifier for grouping
        parent_amr_id: Optional parent AMR for hierarchical metering

    Returns:
        Signed AMR object for compute resources
    """
    return make_amr(
        consumer_agent_id=consumer_agent_id,
        provider_agent_id=provider_agent_id,
        resource_class="COMPUTE",
        resource_subtype=resource_subtype,
        quantity=quantity,
        unit=unit,
        start_ms=start_ms,
        end_ms=end_ms,
        attestation_method=attestation_method,
        rate_micros_per_unit=rate_micros_per_unit,
        request_hash=request_hash,
        response_hash=response_hash,
        provider_private_key=provider_private_key,
        meter_id=meter_id,
        session_id=session_id,
        parent_amr_id=parent_amr_id,
    )


def make_energy_meter(
    consumer_agent_id: str,
    provider_agent_id: str,
    resource_subtype: str,
    quantity: int,
    unit: str,
    start_ms: int,
    end_ms: int,
    rate_micros_per_unit: int,
    request_hash: str,
    response_hash: str,
    provider_private_key: str,
    attestation_method: AttestationMethod = "ORACLE",
    oracle_id: Optional[str] = None,
    oracle_signature: Optional[str] = None,
    meter_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> AMR:
    """
    Create an attested metering record for energy resources.

    This is a convenience wrapper around make_amr() specifically for energy resources
    (grid power, renewable energy, etc.).

    Args:
        consumer_agent_id: Agent consuming the energy
        provider_agent_id: Agent providing the energy
        resource_subtype: Specific energy type (e.g., "grid_power", "solar", "wind")
        quantity: Amount of energy consumed
        unit: Unit of measurement (e.g., "kwh", "mwh", "joules")
        start_ms: Start timestamp in milliseconds
        end_ms: End timestamp in milliseconds
        rate_micros_per_unit: Price in USD micros per unit
        request_hash: Hash of the request that triggered consumption
        response_hash: Hash of the response/acknowledgment
        provider_private_key: Private key for signing the AMR
        attestation_method: How consumption is attested (default: ORACLE for energy grid)
        oracle_id: Optional oracle identifier (e.g., utility company)
        oracle_signature: Optional oracle signature
        meter_id: Optional physical meter identifier
        session_id: Optional session identifier for grouping

    Returns:
        Signed AMR object for energy resources
    """
    return make_amr(
        consumer_agent_id=consumer_agent_id,
        provider_agent_id=provider_agent_id,
        resource_class="ENERGY",
        resource_subtype=resource_subtype,
        quantity=quantity,
        unit=unit,
        start_ms=start_ms,
        end_ms=end_ms,
        attestation_method=attestation_method,
        rate_micros_per_unit=rate_micros_per_unit,
        request_hash=request_hash,
        response_hash=response_hash,
        provider_private_key=provider_private_key,
        oracle_id=oracle_id,
        oracle_signature=oracle_signature,
        meter_id=meter_id,
        session_id=session_id,
    )


def make_storage_meter(
    consumer_agent_id: str,
    provider_agent_id: str,
    resource_subtype: str,
    quantity: int,
    unit: str,
    start_ms: int,
    end_ms: int,
    rate_micros_per_unit: int,
    request_hash: str,
    response_hash: str,
    provider_private_key: str,
    attestation_method: AttestationMethod = "SIGNED_METER",
    meter_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> AMR:
    """
    Create an attested metering record for storage resources.

    This is a convenience wrapper around make_amr() specifically for storage resources
    (S3, databases, file systems, etc.).

    Args:
        consumer_agent_id: Agent consuming the storage
        provider_agent_id: Agent providing the storage
        resource_subtype: Specific storage type (e.g., "s3_standard", "db_mysql", "fs_nfs")
        quantity: Amount of storage consumed
        unit: Unit of measurement (e.g., "gb_month", "tb_day", "iops")
        start_ms: Start timestamp in milliseconds
        end_ms: End timestamp in milliseconds
        rate_micros_per_unit: Price in USD micros per unit
        request_hash: Hash of the request that triggered consumption
        response_hash: Hash of the response
        provider_private_key: Private key for signing the AMR
        attestation_method: How consumption is attested (default: SIGNED_METER)
        meter_id: Optional meter identifier
        session_id: Optional session identifier for grouping

    Returns:
        Signed AMR object for storage resources
    """
    return make_amr(
        consumer_agent_id=consumer_agent_id,
        provider_agent_id=provider_agent_id,
        resource_class="STORAGE",
        resource_subtype=resource_subtype,
        quantity=quantity,
        unit=unit,
        start_ms=start_ms,
        end_ms=end_ms,
        attestation_method=attestation_method,
        rate_micros_per_unit=rate_micros_per_unit,
        request_hash=request_hash,
        response_hash=response_hash,
        provider_private_key=provider_private_key,
        meter_id=meter_id,
        session_id=session_id,
    )


def make_bandwidth_meter(
    consumer_agent_id: str,
    provider_agent_id: str,
    resource_subtype: str,
    quantity: int,
    unit: str,
    start_ms: int,
    end_ms: int,
    rate_micros_per_unit: int,
    request_hash: str,
    response_hash: str,
    provider_private_key: str,
    attestation_method: AttestationMethod = "SIGNED_METER",
    meter_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> AMR:
    """
    Create an attested metering record for bandwidth/network resources.

    This is a convenience wrapper around make_amr() specifically for bandwidth resources
    (egress, ingress, CDN, etc.).

    Args:
        consumer_agent_id: Agent consuming the bandwidth
        provider_agent_id: Agent providing the bandwidth
        resource_subtype: Specific bandwidth type (e.g., "egress", "ingress", "cdn")
        quantity: Amount of bandwidth consumed
        unit: Unit of measurement (e.g., "gb", "tb", "mbps_hours")
        start_ms: Start timestamp in milliseconds
        end_ms: End timestamp in milliseconds
        rate_micros_per_unit: Price in USD micros per unit
        request_hash: Hash of the request that triggered consumption
        response_hash: Hash of the response
        provider_private_key: Private key for signing the AMR
        attestation_method: How consumption is attested (default: SIGNED_METER)
        meter_id: Optional meter identifier
        session_id: Optional session identifier for grouping

    Returns:
        Signed AMR object for bandwidth resources
    """
    return make_amr(
        consumer_agent_id=consumer_agent_id,
        provider_agent_id=provider_agent_id,
        resource_class="BANDWIDTH",
        resource_subtype=resource_subtype,
        quantity=quantity,
        unit=unit,
        start_ms=start_ms,
        end_ms=end_ms,
        attestation_method=attestation_method,
        rate_micros_per_unit=rate_micros_per_unit,
        request_hash=request_hash,
        response_hash=response_hash,
        provider_private_key=provider_private_key,
        meter_id=meter_id,
        session_id=session_id,
    )


def make_inference_meter(
    consumer_agent_id: str,
    provider_agent_id: str,
    model_name: str,
    tokens: int,
    start_ms: int,
    end_ms: int,
    rate_micros_per_1k_tokens: int,
    request_hash: str,
    response_hash: str,
    provider_private_key: str,
    attestation_method: AttestationMethod = "SIGNED_METER",
    session_id: Optional[str] = None,
) -> AMR:
    """
    Create an attested metering record for LLM inference.

    This is a specialized convenience function for LLM inference metering.

    Args:
        consumer_agent_id: Agent consuming the inference
        provider_agent_id: Agent providing the inference
        model_name: Model used (e.g., "gpt-4o", "claude-opus", "llama-3")
        tokens: Number of tokens processed
        start_ms: Start timestamp in milliseconds
        end_ms: End timestamp in milliseconds
        rate_micros_per_1k_tokens: Price in USD micros per 1000 tokens
        request_hash: Hash of the request prompt
        response_hash: Hash of the response completion
        provider_private_key: Private key for signing the AMR
        attestation_method: How consumption is attested (default: SIGNED_METER)
        session_id: Optional session identifier for grouping

    Returns:
        Signed AMR object for inference resources
    """
    # Convert tokens to thousands for standard pricing
    quantity = tokens // 1000 if tokens >= 1000 else 1

    return make_amr(
        consumer_agent_id=consumer_agent_id,
        provider_agent_id=provider_agent_id,
        resource_class="INFERENCE",
        resource_subtype=model_name,
        quantity=quantity,
        unit="tokens_1k",
        start_ms=start_ms,
        end_ms=end_ms,
        attestation_method=attestation_method,
        rate_micros_per_unit=rate_micros_per_1k_tokens,
        request_hash=request_hash,
        response_hash=response_hash,
        provider_private_key=provider_private_key,
        session_id=session_id,
    )


__all__ = [
    "make_compute_meter",
    "make_energy_meter",
    "make_storage_meter",
    "make_bandwidth_meter",
    "make_inference_meter",
]
