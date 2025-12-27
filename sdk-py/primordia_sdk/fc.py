"""
Future Commitment (FC) v0.1
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple

from .canonical import canonicalize_bytes
from .crypto import hash_bytes, sign, verify


@dataclass
class DeliveryWindow:
    start_ms: int
    end_ms: int

    def to_dict(self) -> Dict[str, int]:
        return {"start_ms": self.start_ms, "end_ms": self.end_ms}


@dataclass
class Penalty:
    penalty_usd_micros: int
    rule_hash: str

    def to_dict(self) -> Dict[str, Any]:
        return {"penalty_usd_micros": self.penalty_usd_micros, "rule_hash": self.rule_hash}


@dataclass
class FC:
    fc_version: str
    issuer_agent_id: str
    counterparty_agent_id: str
    resource_type: str
    units: int
    unit_type: str
    delivery_window: DeliveryWindow
    penalty: Penalty
    collateral: Optional[int]
    commitment_hash: str
    signature_ed25519: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fc_version": self.fc_version,
            "issuer_agent_id": self.issuer_agent_id,
            "counterparty_agent_id": self.counterparty_agent_id,
            "resource_type": self.resource_type,
            "units": self.units,
            "unit_type": self.unit_type,
            "delivery_window": self.delivery_window.to_dict(),
            "penalty": self.penalty.to_dict(),
            "collateral": self.collateral,
            "commitment_hash": self.commitment_hash,
            "signature_ed25519": self.signature_ed25519,
        }


def compute_commitment_hash(
    issuer_agent_id: str,
    counterparty_agent_id: str,
    resource_type: str,
    units: int,
    delivery_window: DeliveryWindow,
) -> str:
    """Compute the commitment hash."""
    data = {
        "issuer": issuer_agent_id,
        "counterparty": counterparty_agent_id,
        "resource": resource_type,
        "units": units,
        "window": delivery_window.to_dict(),
    }
    return hash_bytes(canonicalize_bytes(data))


def make_fc(
    issuer_agent_id: str,
    counterparty_agent_id: str,
    resource_type: str,
    units: int,
    unit_type: str,
    delivery_window: DeliveryWindow,
    penalty: Penalty,
    private_key: str,
    collateral: Optional[int] = None,
) -> FC:
    """Create a signed FC."""
    commitment_hash = compute_commitment_hash(
        issuer_agent_id, counterparty_agent_id, resource_type, units, delivery_window
    )

    fc_data = {
        "fc_version": "0.1",
        "issuer_agent_id": issuer_agent_id,
        "counterparty_agent_id": counterparty_agent_id,
        "resource_type": resource_type,
        "units": units,
        "unit_type": unit_type,
        "delivery_window": delivery_window.to_dict(),
        "penalty": penalty.to_dict(),
        "collateral": collateral,
        "commitment_hash": commitment_hash,
    }

    canonical_bytes = canonicalize_bytes(fc_data)
    fc_hash = hash_bytes(canonical_bytes)
    signature = sign(fc_hash, private_key)

    return FC(
        fc_version="0.1",
        issuer_agent_id=issuer_agent_id,
        counterparty_agent_id=counterparty_agent_id,
        resource_type=resource_type,
        units=units,
        unit_type=unit_type,
        delivery_window=delivery_window,
        penalty=penalty,
        collateral=collateral,
        commitment_hash=commitment_hash,
        signature_ed25519=signature,
    )


def verify_fc(fc: FC, public_key: str) -> Tuple[bool, str, Optional[str]]:
    """
    Verify an FC.
    Returns (valid, hash, error_message).
    """
    # Validate required fields
    if fc.fc_version != "0.1":
        return False, "", "Invalid fc_version"
    if fc.issuer_agent_id == fc.counterparty_agent_id:
        return False, "", "Issuer and counterparty cannot be same"
    if fc.units <= 0:
        return False, "", "Units must be positive"
    if fc.delivery_window.start_ms >= fc.delivery_window.end_ms:
        return False, "", "Invalid delivery window"
    if fc.penalty.penalty_usd_micros <= 0:
        return False, "", "Penalty must be positive"

    # Verify commitment hash
    expected_hash = compute_commitment_hash(
        fc.issuer_agent_id,
        fc.counterparty_agent_id,
        fc.resource_type,
        fc.units,
        fc.delivery_window,
    )
    if fc.commitment_hash != expected_hash:
        return False, "", "Invalid commitment hash"

    # Compute FC hash
    fc_dict = fc.to_dict()
    del fc_dict["signature_ed25519"]
    fc_hash = hash_bytes(canonicalize_bytes(fc_dict))

    # Verify signature
    if not verify(fc_hash, fc.signature_ed25519, public_key):
        return False, fc_hash, "Invalid signature"

    return True, fc_hash, None
