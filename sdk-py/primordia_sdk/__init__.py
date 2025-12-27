"""
Primordia SDK v0.1
Inter-Agent Settlement Primitives

RAIL 1: Settlement - MSR, IAN
RAIL 2: Credit - FC, MBS, DBP
RAIL 3: Metering - AMR
"""

from .canonical import canonicalize, canonicalize_bytes
from .crypto import hash, hash_bytes, sign, verify, generate_keypair

# RAIL 1: Settlement
from .msr import make_msr, verify_msr, get_msr_hash, MSR
from .netting import net_receipts, make_ian, verify_ian, IAN, NetObligation

# RAIL 2: Credit
from .fc import make_fc, verify_fc, FC, DeliveryWindow, Penalty
from .mbs import compute_mbs, verify_mbs, compute_runway_seconds, compute_solvency_ratio, MBS, Asset, Liability
from .dbp import (
    make_dbp,
    verify_dbp,
    should_auto_default,
    trigger_default,
    resolve_default,
    DBP,
    Creditor,
    Distribution,
    DeclarationType,
    TriggerType,
    LiquidationMethod,
)

# RAIL 3: Metering
from .amr import (
    make_amr,
    verify_amr,
    cosign_amr,
    meets_confidence_threshold,
    aggregate_amrs,
    AMR,
    Metering,
    Attestation,
    RESOURCE_PRICING,
    ResourceClass,
    AttestationMethod,
)
from .meter import (
    make_compute_meter,
    make_energy_meter,
    make_storage_meter,
    make_bandwidth_meter,
    make_inference_meter,
)

__version__ = "0.1.0"
__all__ = [
    # Canonical & Crypto
    "canonicalize",
    "canonicalize_bytes",
    "hash",
    "hash_bytes",
    "sign",
    "verify",
    "generate_keypair",
    # RAIL 1: MSR
    "make_msr",
    "verify_msr",
    "get_msr_hash",
    "MSR",
    # RAIL 1: IAN (netting)
    "net_receipts",
    "make_ian",
    "verify_ian",
    "IAN",
    "NetObligation",
    # RAIL 2: FC
    "make_fc",
    "verify_fc",
    "FC",
    "DeliveryWindow",
    "Penalty",
    # RAIL 2: MBS
    "compute_mbs",
    "verify_mbs",
    "compute_runway_seconds",
    "compute_solvency_ratio",
    "MBS",
    "Asset",
    "Liability",
    # RAIL 2: DBP
    "make_dbp",
    "verify_dbp",
    "should_auto_default",
    "trigger_default",
    "resolve_default",
    "DBP",
    "Creditor",
    "Distribution",
    "DeclarationType",
    "TriggerType",
    "LiquidationMethod",
    # RAIL 3: AMR
    "make_amr",
    "verify_amr",
    "cosign_amr",
    "meets_confidence_threshold",
    "aggregate_amrs",
    "AMR",
    "Metering",
    "Attestation",
    "RESOURCE_PRICING",
    "ResourceClass",
    "AttestationMethod",
    # RAIL 3: Meter helpers
    "make_compute_meter",
    "make_energy_meter",
    "make_storage_meter",
    "make_bandwidth_meter",
    "make_inference_meter",
]
