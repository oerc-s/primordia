"""
Machine Balance Sheet (MBS) v0.1
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple
import time

from .canonical import canonicalize_bytes
from .crypto import hash_bytes, sign, verify


MAX_SOLVENCY = 999999


@dataclass
class Asset:
    asset_type: str
    amount: int

    def to_dict(self) -> Dict[str, Any]:
        return {"asset_type": self.asset_type, "amount": self.amount}


@dataclass
class Liability:
    liability_type: str
    amount: int

    def to_dict(self) -> Dict[str, Any]:
        return {"liability_type": self.liability_type, "amount": self.amount}


@dataclass
class MBS:
    mbs_version: str
    agent_id: str
    assets: List[Asset]
    liabilities: List[Liability]
    burn_rate_usd_micros_per_s: int
    solvency_ratio: int
    timestamp_ms: int
    signature_ed25519: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mbs_version": self.mbs_version,
            "agent_id": self.agent_id,
            "assets": [a.to_dict() for a in self.assets],
            "liabilities": [l.to_dict() for l in self.liabilities],
            "burn_rate_usd_micros_per_s": self.burn_rate_usd_micros_per_s,
            "solvency_ratio": self.solvency_ratio,
            "timestamp_ms": self.timestamp_ms,
            "signature_ed25519": self.signature_ed25519,
        }


def compute_solvency_ratio(assets: List[Asset], liabilities: List[Liability]) -> int:
    """Compute solvency ratio in basis points."""
    total_assets = sum(a.amount for a in assets)
    total_liabilities = sum(l.amount for l in liabilities)

    if total_liabilities == 0:
        return MAX_SOLVENCY

    return (total_assets * 10000) // total_liabilities


def compute_mbs(
    agent_id: str,
    assets: List[Asset],
    liabilities: List[Liability],
    burn_rate_usd_micros_per_s: int,
    private_key: str,
    timestamp_ms: Optional[int] = None,
) -> MBS:
    """Create a signed MBS."""
    solvency_ratio = compute_solvency_ratio(assets, liabilities)

    mbs_data = {
        "mbs_version": "0.1",
        "agent_id": agent_id,
        "assets": [a.to_dict() for a in assets],
        "liabilities": [l.to_dict() for l in liabilities],
        "burn_rate_usd_micros_per_s": burn_rate_usd_micros_per_s,
        "solvency_ratio": solvency_ratio,
        "timestamp_ms": timestamp_ms or int(time.time() * 1000),
    }

    canonical_bytes = canonicalize_bytes(mbs_data)
    mbs_hash = hash_bytes(canonical_bytes)
    signature = sign(mbs_hash, private_key)

    return MBS(
        mbs_version="0.1",
        agent_id=agent_id,
        assets=assets,
        liabilities=liabilities,
        burn_rate_usd_micros_per_s=burn_rate_usd_micros_per_s,
        solvency_ratio=solvency_ratio,
        timestamp_ms=mbs_data["timestamp_ms"],
        signature_ed25519=signature,
    )


def verify_mbs(mbs: MBS, public_key: str) -> Tuple[bool, Optional[str]]:
    """
    Verify an MBS.
    Returns (valid, error_message).
    """
    if mbs.mbs_version != "0.1":
        return False, "Invalid mbs_version"

    # Validate amounts
    for asset in mbs.assets:
        if asset.amount < 0:
            return False, "Asset amount cannot be negative"

    for liability in mbs.liabilities:
        if liability.amount < 0:
            return False, "Liability amount cannot be negative"

    if mbs.burn_rate_usd_micros_per_s < 0:
        return False, "Burn rate cannot be negative"

    # Verify solvency ratio
    expected_ratio = compute_solvency_ratio(mbs.assets, mbs.liabilities)
    if mbs.solvency_ratio != expected_ratio:
        return False, "Invalid solvency ratio"

    # Verify signature
    mbs_dict = mbs.to_dict()
    del mbs_dict["signature_ed25519"]
    mbs_hash = hash_bytes(canonicalize_bytes(mbs_dict))

    if not verify(mbs_hash, mbs.signature_ed25519, public_key):
        return False, "Invalid signature"

    return True, None


def compute_runway_seconds(mbs: MBS) -> float:
    """Compute runway in seconds until insolvency."""
    total_assets = sum(a.amount for a in mbs.assets)
    total_liabilities = sum(l.amount for l in mbs.liabilities)
    net_assets = total_assets - total_liabilities

    if mbs.burn_rate_usd_micros_per_s == 0:
        return float("inf") if net_assets > 0 else 0.0

    return max(0.0, net_assets / mbs.burn_rate_usd_micros_per_s)
