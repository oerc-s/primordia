"""
P8: AMR - Attested Metering Record
Cryptographic proof of resource consumption
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, List, Literal
import time

from .canonical import canonicalize_bytes
from .crypto import hash_bytes, sign, verify


ResourceClass = Literal["COMPUTE", "INFERENCE", "ENERGY", "STORAGE", "BANDWIDTH"]
AttestationMethod = Literal["TEE", "SIGNED_METER", "ORACLE", "SELF_REPORT"]


@dataclass
class Metering:
    quantity: int
    unit: str
    start_ms: int
    end_ms: int
    duration_ms: int
    breakdown: Optional[Dict[str, int]] = None


@dataclass
class Attestation:
    method: AttestationMethod
    confidence_bps: int
    tee_quote: Optional[str] = None
    tee_type: Optional[str] = None
    enclave_hash: Optional[str] = None
    meter_id: Optional[str] = None
    meter_pubkey: Optional[str] = None
    meter_signature: Optional[str] = None
    oracle_id: Optional[str] = None
    oracle_pubkey: Optional[str] = None
    oracle_signature: Optional[str] = None


@dataclass
class Pricing:
    rate_micros_per_unit: int
    total_micros: int
    currency: str = "USD"


@dataclass
class Context:
    request_hash: str
    response_hash: str
    session_id: Optional[str] = None
    parent_amr_id: Optional[str] = None


@dataclass
class AMR:
    amr_version: str
    record_id: str
    consumer_agent_id: str
    provider_agent_id: str
    resource_class: ResourceClass
    resource_subtype: str
    metering: Metering
    attestation: Attestation
    pricing: Pricing
    context: Context
    timestamp_ms: int
    amr_hash: str
    provider_signature: str
    consumer_signature: Optional[str] = None

    def to_dict(self) -> dict:
        result = {
            "amr_version": self.amr_version,
            "record_id": self.record_id,
            "consumer_agent_id": self.consumer_agent_id,
            "provider_agent_id": self.provider_agent_id,
            "resource_class": self.resource_class,
            "resource_subtype": self.resource_subtype,
            "metering": {
                "quantity": self.metering.quantity,
                "unit": self.metering.unit,
                "start_ms": self.metering.start_ms,
                "end_ms": self.metering.end_ms,
                "duration_ms": self.metering.duration_ms,
            },
            "attestation": {
                "method": self.attestation.method,
                "confidence_bps": self.attestation.confidence_bps,
            },
            "pricing": {
                "rate_micros_per_unit": self.pricing.rate_micros_per_unit,
                "total_micros": self.pricing.total_micros,
                "currency": self.pricing.currency,
            },
            "context": {
                "request_hash": self.context.request_hash,
                "response_hash": self.context.response_hash,
            },
            "timestamp_ms": self.timestamp_ms,
            "amr_hash": self.amr_hash,
            "provider_signature": self.provider_signature,
        }

        if self.metering.breakdown:
            result["metering"]["breakdown"] = self.metering.breakdown

        if self.attestation.tee_quote:
            result["attestation"]["tee_quote"] = self.attestation.tee_quote
        if self.attestation.tee_type:
            result["attestation"]["tee_type"] = self.attestation.tee_type
        if self.attestation.meter_id:
            result["attestation"]["meter_id"] = self.attestation.meter_id
        if self.attestation.oracle_id:
            result["attestation"]["oracle_id"] = self.attestation.oracle_id

        if self.context.session_id:
            result["context"]["session_id"] = self.context.session_id
        if self.context.parent_amr_id:
            result["context"]["parent_amr_id"] = self.context.parent_amr_id

        if self.consumer_signature:
            result["consumer_signature"] = self.consumer_signature

        return result


def get_confidence_bps(method: AttestationMethod) -> int:
    """Compute confidence score based on attestation method."""
    return {
        "TEE": 9999,
        "SIGNED_METER": 9500,
        "ORACLE": 9000,
        "SELF_REPORT": 5000,
    }.get(method, 5000)


def make_amr(
    consumer_agent_id: str,
    provider_agent_id: str,
    resource_class: ResourceClass,
    resource_subtype: str,
    quantity: int,
    unit: str,
    start_ms: int,
    end_ms: int,
    attestation_method: AttestationMethod,
    rate_micros_per_unit: int,
    request_hash: str,
    response_hash: str,
    provider_private_key: str,
    tee_quote: Optional[str] = None,
    tee_type: Optional[str] = None,
    meter_id: Optional[str] = None,
    meter_signature: Optional[str] = None,
    oracle_id: Optional[str] = None,
    oracle_signature: Optional[str] = None,
    session_id: Optional[str] = None,
    parent_amr_id: Optional[str] = None,
) -> AMR:
    """Create a signed AMR."""
    duration_ms = end_ms - start_ms
    total_micros = quantity * rate_micros_per_unit

    attestation = Attestation(
        method=attestation_method,
        confidence_bps=get_confidence_bps(attestation_method),
        tee_quote=tee_quote,
        tee_type=tee_type,
        meter_id=meter_id,
        oracle_id=oracle_id,
    )

    amr_without_sig = {
        "amr_version": "0.1",
        "record_id": "",
        "consumer_agent_id": consumer_agent_id,
        "provider_agent_id": provider_agent_id,
        "resource_class": resource_class,
        "resource_subtype": resource_subtype,
        "metering": {
            "quantity": quantity,
            "unit": unit,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "duration_ms": duration_ms,
        },
        "attestation": {
            "method": attestation_method,
            "confidence_bps": attestation.confidence_bps,
        },
        "pricing": {
            "rate_micros_per_unit": rate_micros_per_unit,
            "total_micros": total_micros,
            "currency": "USD",
        },
        "context": {
            "request_hash": request_hash,
            "response_hash": response_hash,
        },
        "timestamp_ms": int(time.time() * 1000),
        "amr_hash": "",
    }

    # Add optional fields
    if tee_quote:
        amr_without_sig["attestation"]["tee_quote"] = tee_quote
    if meter_id:
        amr_without_sig["attestation"]["meter_id"] = meter_id
    if oracle_id:
        amr_without_sig["attestation"]["oracle_id"] = oracle_id
    if session_id:
        amr_without_sig["context"]["session_id"] = session_id
    if parent_amr_id:
        amr_without_sig["context"]["parent_amr_id"] = parent_amr_id

    # Compute hash
    content_hash = hash_bytes(canonicalize_bytes(amr_without_sig))
    amr_without_sig["record_id"] = content_hash
    amr_without_sig["amr_hash"] = content_hash

    # Sign
    signature = sign(content_hash, provider_private_key)

    return AMR(
        amr_version="0.1",
        record_id=content_hash,
        consumer_agent_id=consumer_agent_id,
        provider_agent_id=provider_agent_id,
        resource_class=resource_class,
        resource_subtype=resource_subtype,
        metering=Metering(
            quantity=quantity,
            unit=unit,
            start_ms=start_ms,
            end_ms=end_ms,
            duration_ms=duration_ms,
        ),
        attestation=attestation,
        pricing=Pricing(
            rate_micros_per_unit=rate_micros_per_unit,
            total_micros=total_micros,
        ),
        context=Context(
            request_hash=request_hash,
            response_hash=response_hash,
            session_id=session_id,
            parent_amr_id=parent_amr_id,
        ),
        timestamp_ms=amr_without_sig["timestamp_ms"],
        amr_hash=content_hash,
        provider_signature=signature,
    )


def cosign_amr(amr: AMR, consumer_private_key: str) -> AMR:
    """Consumer co-signs AMR."""
    signature = sign(amr.amr_hash, consumer_private_key)
    amr.consumer_signature = signature
    return amr


def verify_amr(amr: AMR) -> dict:
    """Verify AMR signatures."""
    provider_valid = verify(amr.amr_hash, amr.provider_signature, amr.provider_agent_id)

    consumer_valid = None
    if amr.consumer_signature:
        consumer_valid = verify(amr.amr_hash, amr.consumer_signature, amr.consumer_agent_id)

    return {"provider_valid": provider_valid, "consumer_valid": consumer_valid}


def meets_confidence_threshold(amr: AMR, min_confidence_bps: int) -> bool:
    """Check if AMR attestation meets minimum confidence threshold."""
    return amr.attestation.confidence_bps >= min_confidence_bps


def aggregate_amrs(amrs: List[AMR]) -> dict:
    """Aggregate multiple AMRs into summary."""
    total_quantity = 0
    total_micros = 0
    total_confidence = 0
    by_resource_class: Dict[str, Dict[str, int]] = {}

    for amr in amrs:
        total_quantity += amr.metering.quantity
        total_micros += amr.pricing.total_micros
        total_confidence += amr.attestation.confidence_bps

        if amr.resource_class not in by_resource_class:
            by_resource_class[amr.resource_class] = {"quantity": 0, "micros": 0}
        by_resource_class[amr.resource_class]["quantity"] += amr.metering.quantity
        by_resource_class[amr.resource_class]["micros"] += amr.pricing.total_micros

    return {
        "total_quantity": total_quantity,
        "total_micros": total_micros,
        "by_resource_class": by_resource_class,
        "avg_confidence_bps": total_confidence // len(amrs) if amrs else 0,
    }


# Common resource pricing
RESOURCE_PRICING = {
    "gpt-4o": {"rate_micros_per_unit": 5, "unit": "tokens_1k"},
    "gpt-4-turbo": {"rate_micros_per_unit": 10, "unit": "tokens_1k"},
    "claude-opus": {"rate_micros_per_unit": 15, "unit": "tokens_1k"},
    "claude-sonnet": {"rate_micros_per_unit": 3, "unit": "tokens_1k"},
    "gpu_h100": {"rate_micros_per_unit": 1000, "unit": "gpu_seconds"},
    "gpu_a100": {"rate_micros_per_unit": 500, "unit": "gpu_seconds"},
    "s3_standard": {"rate_micros_per_unit": 23000, "unit": "gb_month"},
    "egress": {"rate_micros_per_unit": 90000, "unit": "gb"},
    "grid_power": {"rate_micros_per_unit": 100000, "unit": "kwh"},
}
