"""
P7: DBP - Default/Bankruptcy Primitive
Deterministic agent default and liquidation
"""

from dataclasses import dataclass
from typing import List, Optional, Literal
import time

from .canonical import canonicalize_bytes
from .crypto import hash_bytes, sign, verify


DeclarationType = Literal["VOLUNTARY", "INVOLUNTARY", "AUTOMATIC"]
TriggerType = Literal["MISSED_FC", "NEGATIVE_MBS", "MARGIN_CALL", "TIMEOUT"]
LiquidationMethod = Literal["PRO_RATA", "PRIORITY", "AUCTION"]


@dataclass
class Creditor:
    agent_id: str
    amount_micros: int
    priority: int
    collateralized: bool


@dataclass
class Asset:
    asset_type: str
    value_micros: int
    liquid: bool


@dataclass
class Distribution:
    creditor_id: str
    receives_micros: int
    recovery_bps: int


@dataclass
class Trigger:
    type: TriggerType
    reference_id: str
    trigger_timestamp_ms: int


@dataclass
class ObligationsSnapshot:
    total_owed_micros: int
    creditors: List[Creditor]


@dataclass
class AssetsSnapshot:
    total_value_micros: int
    assets: List[Asset]


@dataclass
class LiquidationPlan:
    method: LiquidationMethod
    distributions: List[Distribution]


@dataclass
class DBP:
    dbp_version: str
    default_id: str
    defaulting_agent_id: str
    declaration_type: DeclarationType
    trigger: Trigger
    obligations_snapshot: ObligationsSnapshot
    assets_snapshot: AssetsSnapshot
    recovery_rate_bps: int
    liquidation_plan: LiquidationPlan
    timestamp_ms: int
    arbiter_agent_id: str
    dbp_hash: str
    signature_ed25519: str

    def to_dict(self) -> dict:
        return {
            "dbp_version": self.dbp_version,
            "default_id": self.default_id,
            "defaulting_agent_id": self.defaulting_agent_id,
            "declaration_type": self.declaration_type,
            "trigger": {
                "type": self.trigger.type,
                "reference_id": self.trigger.reference_id,
                "trigger_timestamp_ms": self.trigger.trigger_timestamp_ms,
            },
            "obligations_snapshot": {
                "total_owed_micros": self.obligations_snapshot.total_owed_micros,
                "creditors": [
                    {"agent_id": c.agent_id, "amount_micros": c.amount_micros,
                     "priority": c.priority, "collateralized": c.collateralized}
                    for c in sorted(self.obligations_snapshot.creditors, key=lambda x: x.agent_id)
                ],
            },
            "assets_snapshot": {
                "total_value_micros": self.assets_snapshot.total_value_micros,
                "assets": [
                    {"asset_type": a.asset_type, "value_micros": a.value_micros, "liquid": a.liquid}
                    for a in sorted(self.assets_snapshot.assets, key=lambda x: x.asset_type)
                ],
            },
            "recovery_rate_bps": self.recovery_rate_bps,
            "liquidation_plan": {
                "method": self.liquidation_plan.method,
                "distributions": [
                    {"creditor_id": d.creditor_id, "receives_micros": d.receives_micros,
                     "recovery_bps": d.recovery_bps}
                    for d in sorted(self.liquidation_plan.distributions, key=lambda x: x.creditor_id)
                ],
            },
            "timestamp_ms": self.timestamp_ms,
            "arbiter_agent_id": self.arbiter_agent_id,
            "dbp_hash": self.dbp_hash,
            "signature_ed25519": self.signature_ed25519,
        }


def compute_distributions(
    creditors: List[Creditor],
    total_assets: int,
    method: LiquidationMethod
) -> List[Distribution]:
    """Compute liquidation distributions based on method."""
    # Handle empty creditors
    if not creditors:
        return []

    total_owed = sum(c.amount_micros for c in creditors)

    # Handle zero total owed
    if total_owed == 0:
        return [
            Distribution(creditor_id=c.agent_id, receives_micros=0, recovery_bps=0)
            for c in creditors
        ]

    if method == "PRO_RATA":
        result = []
        for c in creditors:
            receives = int((c.amount_micros / total_owed) * total_assets)
            recovery = int((receives / c.amount_micros) * 10000) if c.amount_micros > 0 else 0
            result.append(Distribution(
                creditor_id=c.agent_id,
                receives_micros=receives,
                recovery_bps=recovery
            ))
        return result

    if method == "PRIORITY":
        distributions = []
        remaining = total_assets
        sorted_creditors = sorted(creditors, key=lambda x: x.priority)

        for c in sorted_creditors:
            receives = min(c.amount_micros, remaining)
            remaining -= receives
            distributions.append(Distribution(
                creditor_id=c.agent_id,
                receives_micros=receives,
                recovery_bps=int((receives / c.amount_micros) * 10000) if c.amount_micros > 0 else 0
            ))
        return distributions

    # AUCTION - same as PRO_RATA for now
    return compute_distributions(creditors, total_assets, "PRO_RATA")


def make_dbp(
    defaulting_agent_id: str,
    declaration_type: DeclarationType,
    trigger_type: TriggerType,
    trigger_reference_id: str,
    creditors: List[Creditor],
    assets: List[Asset],
    liquidation_method: LiquidationMethod,
    arbiter_agent_id: str,
    arbiter_private_key: str
) -> DBP:
    """Create a signed DBP."""
    now = int(time.time() * 1000)
    total_owed = sum(c.amount_micros for c in creditors)
    total_assets = sum(a.value_micros for a in assets)

    distributions = compute_distributions(creditors, total_assets, liquidation_method)
    total_distributed = sum(d.receives_micros for d in distributions)
    recovery_rate_bps = int((total_distributed / total_owed) * 10000) if total_owed > 0 else 0

    # Content for hashing (excludes default_id, dbp_hash, signature)
    dbp_content = {
        "dbp_version": "0.1",
        "defaulting_agent_id": defaulting_agent_id,
        "declaration_type": declaration_type,
        "trigger": {
            "type": trigger_type,
            "reference_id": trigger_reference_id,
            "trigger_timestamp_ms": now,
        },
        "obligations_snapshot": {
            "total_owed_micros": total_owed,
            "creditors": [
                {"agent_id": c.agent_id, "amount_micros": c.amount_micros,
                 "priority": c.priority, "collateralized": c.collateralized}
                for c in sorted(creditors, key=lambda x: x.agent_id)
            ],
        },
        "assets_snapshot": {
            "total_value_micros": total_assets,
            "assets": [
                {"asset_type": a.asset_type, "value_micros": a.value_micros, "liquid": a.liquid}
                for a in sorted(assets, key=lambda x: x.asset_type)
            ],
        },
        "recovery_rate_bps": recovery_rate_bps,
        "liquidation_plan": {
            "method": liquidation_method,
            "distributions": [
                {"creditor_id": d.creditor_id, "receives_micros": d.receives_micros,
                 "recovery_bps": d.recovery_bps}
                for d in sorted(distributions, key=lambda x: x.creditor_id)
            ],
        },
        "timestamp_ms": now,
        "arbiter_agent_id": arbiter_agent_id,
    }

    # Compute hash from content only
    content_hash = hash_bytes(canonicalize_bytes(dbp_content))

    # Sign
    signature = sign(content_hash, arbiter_private_key)

    return DBP(
        dbp_version="0.1",
        default_id=content_hash,
        defaulting_agent_id=defaulting_agent_id,
        declaration_type=declaration_type,
        trigger=Trigger(
            type=trigger_type,
            reference_id=trigger_reference_id,
            trigger_timestamp_ms=now
        ),
        obligations_snapshot=ObligationsSnapshot(
            total_owed_micros=total_owed,
            creditors=sorted(creditors, key=lambda x: x.agent_id)
        ),
        assets_snapshot=AssetsSnapshot(
            total_value_micros=total_assets,
            assets=sorted(assets, key=lambda x: x.asset_type)
        ),
        recovery_rate_bps=recovery_rate_bps,
        liquidation_plan=LiquidationPlan(
            method=liquidation_method,
            distributions=sorted(distributions, key=lambda x: x.creditor_id)
        ),
        timestamp_ms=now,
        arbiter_agent_id=arbiter_agent_id,
        dbp_hash=content_hash,
        signature_ed25519=signature
    )


def get_dbp_content(dbp: DBP) -> dict:
    """Extract hashable content from DBP (excludes default_id, dbp_hash, signature)."""
    dbp_dict = dbp.to_dict()
    del dbp_dict["default_id"]
    del dbp_dict["dbp_hash"]
    del dbp_dict["signature_ed25519"]
    return dbp_dict


def verify_dbp(dbp: DBP) -> bool:
    """Verify DBP signature."""
    content = get_dbp_content(dbp)
    computed_hash = hash_bytes(canonicalize_bytes(content))
    return verify(computed_hash, dbp.signature_ed25519, dbp.arbiter_agent_id)


def should_auto_default(runway_seconds: float, threshold_seconds: float = 0) -> bool:
    """Check if agent should trigger automatic default."""
    return runway_seconds < threshold_seconds


def trigger_default(
    defaulting_agent_id: str,
    declaration_type: DeclarationType,
    trigger_type: TriggerType,
    trigger_reference_id: str,
    creditors: List[Creditor],
    assets: List[Asset],
    liquidation_method: LiquidationMethod,
    arbiter_agent_id: str,
    arbiter_private_key: str
) -> DBP:
    """
    Trigger a default event for an agent.

    This is a convenience wrapper around make_dbp() with clearer semantics
    for initiating a default/bankruptcy event.

    Args:
        defaulting_agent_id: Agent that is defaulting
        declaration_type: Type of default (VOLUNTARY, INVOLUNTARY, AUTOMATIC)
        trigger_type: What triggered the default (MISSED_FC, NEGATIVE_MBS, MARGIN_CALL, TIMEOUT)
        trigger_reference_id: Reference to the event that triggered default
        creditors: List of creditors with amounts owed
        assets: List of assets available for liquidation
        liquidation_method: How to distribute assets (PRO_RATA, PRIORITY, AUCTION)
        arbiter_agent_id: Agent managing the default process
        arbiter_private_key: Private key for signing the DBP

    Returns:
        Signed DBP object
    """
    return make_dbp(
        defaulting_agent_id=defaulting_agent_id,
        declaration_type=declaration_type,
        trigger_type=trigger_type,
        trigger_reference_id=trigger_reference_id,
        creditors=creditors,
        assets=assets,
        liquidation_method=liquidation_method,
        arbiter_agent_id=arbiter_agent_id,
        arbiter_private_key=arbiter_private_key
    )


def resolve_default(
    dbp: DBP,
    arbiter_public_key: str
) -> dict:
    """
    Resolve a default by verifying and extracting the liquidation plan.

    Args:
        dbp: DBP object to resolve
        arbiter_public_key: Public key of the arbiter to verify signature

    Returns:
        Dictionary containing:
        - valid: bool - whether the DBP is valid
        - distributions: List[Distribution] - liquidation distributions if valid
        - recovery_rate_bps: int - overall recovery rate in basis points
        - error: Optional[str] - error message if invalid
    """
    # Verify the DBP
    content = get_dbp_content(dbp)
    computed_hash = hash_bytes(canonicalize_bytes(content))

    is_valid = verify(computed_hash, dbp.signature_ed25519, arbiter_public_key)

    if not is_valid:
        return {
            "valid": False,
            "distributions": [],
            "recovery_rate_bps": 0,
            "error": "Invalid arbiter signature"
        }

    # Validate the distributions match the creditors
    total_owed = dbp.obligations_snapshot.total_owed_micros
    total_distributed = sum(d.receives_micros for d in dbp.liquidation_plan.distributions)
    total_assets = dbp.assets_snapshot.total_value_micros

    # Verify distributions don't exceed assets
    if total_distributed > total_assets:
        return {
            "valid": False,
            "distributions": [],
            "recovery_rate_bps": 0,
            "error": "Distributions exceed available assets"
        }

    # Verify recovery rate calculation
    expected_recovery = int((total_distributed / total_owed) * 10000) if total_owed > 0 else 0
    if dbp.recovery_rate_bps != expected_recovery:
        return {
            "valid": False,
            "distributions": [],
            "recovery_rate_bps": 0,
            "error": f"Recovery rate mismatch: expected {expected_recovery}, got {dbp.recovery_rate_bps}"
        }

    return {
        "valid": True,
        "distributions": dbp.liquidation_plan.distributions,
        "recovery_rate_bps": dbp.recovery_rate_bps,
        "error": None
    }
