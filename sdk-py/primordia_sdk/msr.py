"""
Machine Settlement Receipt (MSR) v0.1
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple
import secrets
import time

from .canonical import canonicalize_bytes
from .crypto import hash_bytes, sign, verify


@dataclass
class MSR:
    msr_version: str
    payer_agent_id: str
    payee_agent_id: str
    resource_type: str
    units: int
    unit_type: str
    price_usd_micros: int
    timestamp_ms: int
    nonce: str
    scope_hash: str
    request_hash: str
    response_hash: str
    prev_receipt_hash: Optional[str]
    signature_ed25519: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "msr_version": self.msr_version,
            "payer_agent_id": self.payer_agent_id,
            "payee_agent_id": self.payee_agent_id,
            "resource_type": self.resource_type,
            "units": self.units,
            "unit_type": self.unit_type,
            "price_usd_micros": self.price_usd_micros,
            "timestamp_ms": self.timestamp_ms,
            "nonce": self.nonce,
            "scope_hash": self.scope_hash,
            "request_hash": self.request_hash,
            "response_hash": self.response_hash,
            "prev_receipt_hash": self.prev_receipt_hash,
            "signature_ed25519": self.signature_ed25519,
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "MSR":
        return MSR(
            msr_version=d["msr_version"],
            payer_agent_id=d["payer_agent_id"],
            payee_agent_id=d["payee_agent_id"],
            resource_type=d["resource_type"],
            units=d["units"],
            unit_type=d["unit_type"],
            price_usd_micros=d["price_usd_micros"],
            timestamp_ms=d["timestamp_ms"],
            nonce=d["nonce"],
            scope_hash=d["scope_hash"],
            request_hash=d["request_hash"],
            response_hash=d["response_hash"],
            prev_receipt_hash=d.get("prev_receipt_hash"),
            signature_ed25519=d["signature_ed25519"],
        )


def generate_nonce() -> str:
    """Generate 32-char hex nonce."""
    return secrets.token_hex(16)


def make_msr(
    payer_agent_id: str,
    payee_agent_id: str,
    resource_type: str,
    units: int,
    unit_type: str,
    price_usd_micros: int,
    scope_hash: str,
    request_hash: str,
    response_hash: str,
    private_key: str,
    timestamp_ms: Optional[int] = None,
    nonce: Optional[str] = None,
    prev_receipt_hash: Optional[str] = None,
) -> MSR:
    """Create a signed MSR."""
    msr_data = {
        "msr_version": "0.1",
        "payer_agent_id": payer_agent_id,
        "payee_agent_id": payee_agent_id,
        "resource_type": resource_type,
        "units": units,
        "unit_type": unit_type,
        "price_usd_micros": price_usd_micros,
        "timestamp_ms": timestamp_ms or int(time.time() * 1000),
        "nonce": nonce or generate_nonce(),
        "scope_hash": scope_hash,
        "request_hash": request_hash,
        "response_hash": response_hash,
        "prev_receipt_hash": prev_receipt_hash,
    }

    canonical_bytes = canonicalize_bytes(msr_data)
    msr_hash = hash_bytes(canonical_bytes)
    signature = sign(msr_hash, private_key)

    return MSR(
        **msr_data,
        signature_ed25519=signature,
    )


def get_msr_hash(msr: MSR) -> str:
    """Get the hash of an MSR (without signature)."""
    msr_data = msr.to_dict()
    del msr_data["signature_ed25519"]
    return hash_bytes(canonicalize_bytes(msr_data))


def verify_msr(msr: MSR, public_key: str) -> Tuple[bool, str, Optional[str]]:
    """
    Verify an MSR.
    Returns (valid, hash, error_message).
    """
    # Validate required fields
    if msr.msr_version != "0.1":
        return False, "", "Invalid msr_version"
    if msr.payer_agent_id == msr.payee_agent_id:
        return False, "", "Payer and payee cannot be same"
    if msr.units <= 0:
        return False, "", "Units must be positive"
    if msr.price_usd_micros < 0:
        return False, "", "Price cannot be negative"
    if msr.timestamp_ms <= 0:
        return False, "", "Invalid timestamp"

    # Compute hash
    msr_hash = get_msr_hash(msr)

    # Verify signature
    if not verify(msr_hash, msr.signature_ed25519, public_key):
        return False, msr_hash, "Invalid signature"

    return True, msr_hash, None
