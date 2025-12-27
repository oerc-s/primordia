"""
Inter-Agent Netting (IAN) v0.1
Wrapper module exporting netting functions for IAN creation and verification
"""

from typing import List, Tuple, Optional

from .netting import (
    net_receipts as _net_receipts,
    make_ian as _make_ian,
    verify_ian as _verify_ian,
    NettingResult,
    IAN,
    NetObligation,
)
from .msr import MSR


def net_receipts(receipts: List[MSR]) -> NettingResult:
    """
    Net a list of MSRs into minimal obligations.
    Deterministic: same input -> same output.

    Args:
        receipts: List of MSR objects to net

    Returns:
        NettingResult with obligations, participants, receipt hashes, and total volume
    """
    return _net_receipts(receipts)


def verify_ian(ian: IAN, kernel_public_key: str) -> Tuple[bool, Optional[str]]:
    """
    Verify an Inter-Agent Netting record.

    Args:
        ian: IAN object to verify
        kernel_public_key: Public key of the kernel that signed the IAN

    Returns:
        Tuple of (valid: bool, error_message: Optional[str])
        If valid is True, error_message will be None
        If valid is False, error_message contains the reason
    """
    return _verify_ian(ian, kernel_public_key)


def make_ian(epoch_id: str, receipts: List[MSR], kernel_private_key: str) -> IAN:
    """
    Create a signed Inter-Agent Netting record from receipts.

    Args:
        epoch_id: Identifier for the epoch
        receipts: List of MSR objects to net
        kernel_private_key: Private key for signing the IAN

    Returns:
        Signed IAN object
    """
    return _make_ian(epoch_id, receipts, kernel_private_key)


# Re-export types for convenience
__all__ = [
    "net_receipts",
    "verify_ian",
    "make_ian",
    "IAN",
    "NetObligation",
    "NettingResult",
]
