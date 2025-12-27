"""
Inter-Agent Netting (IAN) v0.1
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple

from .canonical import canonicalize_bytes
from .crypto import hash_bytes, sign, verify
from .msr import MSR, get_msr_hash


@dataclass
class NetObligation:
    from_agent: str
    to_agent: str
    amount_usd_micros: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "from": self.from_agent,
            "to": self.to_agent,
            "amount_usd_micros": self.amount_usd_micros,
        }


@dataclass
class IAN:
    ian_version: str
    epoch_id: str
    participants: List[str]
    included_receipt_hashes: List[str]
    net_obligations: List[NetObligation]
    netting_hash: str
    signature_ed25519: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ian_version": self.ian_version,
            "epoch_id": self.epoch_id,
            "participants": self.participants,
            "included_receipt_hashes": self.included_receipt_hashes,
            "net_obligations": [o.to_dict() for o in self.net_obligations],
            "netting_hash": self.netting_hash,
            "signature_ed25519": self.signature_ed25519,
        }


@dataclass
class NettingResult:
    obligations: List[NetObligation]
    participants: List[str]
    receipt_hashes: List[str]
    total_volume: int


def net_receipts(receipts: List[MSR]) -> NettingResult:
    """
    Net a list of MSRs into minimal obligations.
    Deterministic: same input -> same output.
    """
    # 1. Collect hashes and sort receipts
    receipt_hashes = sorted([get_msr_hash(r) for r in receipts])
    sorted_receipts = sorted(receipts, key=lambda r: get_msr_hash(r))

    # 2. Build balance matrix
    balances: Dict[str, int] = {}
    total_volume = 0

    for receipt in sorted_receipts:
        key = f"{receipt.payer_agent_id}|{receipt.payee_agent_id}"
        balances[key] = balances.get(key, 0) + receipt.price_usd_micros
        total_volume += receipt.price_usd_micros

    # 3. Collect participants
    participants = set()
    for receipt in sorted_receipts:
        participants.add(receipt.payer_agent_id)
        participants.add(receipt.payee_agent_id)
    participants_list = sorted(participants)

    # 4. Net bilateral pairs
    net_balances: Dict[str, int] = {}
    processed = set()

    for key in sorted(balances.keys()):
        a, b = key.split("|")
        pair_key = "|".join(sorted([a, b]))

        if pair_key in processed:
            continue
        processed.add(pair_key)

        a_to_b = balances.get(f"{a}|{b}", 0)
        b_to_a = balances.get(f"{b}|{a}", 0)

        if a_to_b > b_to_a:
            net_balances[f"{a}|{b}"] = a_to_b - b_to_a
        elif b_to_a > a_to_b:
            net_balances[f"{b}|{a}"] = b_to_a - a_to_b

    # 5. Convert to obligations
    obligations = []
    for key in sorted(net_balances.keys()):
        from_agent, to_agent = key.split("|")
        obligations.append(
            NetObligation(
                from_agent=from_agent,
                to_agent=to_agent,
                amount_usd_micros=net_balances[key],
            )
        )

    return NettingResult(
        obligations=obligations,
        participants=participants_list,
        receipt_hashes=receipt_hashes,
        total_volume=total_volume,
    )


def compute_netting_hash(
    epoch_id: str, receipt_hashes: List[str], obligations: List[NetObligation]
) -> str:
    """Compute the netting hash."""
    data = {
        "epoch": epoch_id,
        "receipts": sorted(receipt_hashes),
        "obligations": [o.to_dict() for o in obligations],
    }
    return hash_bytes(canonicalize_bytes(data))


def make_ian(
    epoch_id: str, receipts: List[MSR], kernel_private_key: str
) -> IAN:
    """Create a signed IAN from receipts."""
    result = net_receipts(receipts)
    netting_hash = compute_netting_hash(epoch_id, result.receipt_hashes, result.obligations)

    ian_data = {
        "ian_version": "0.1",
        "epoch_id": epoch_id,
        "participants": result.participants,
        "included_receipt_hashes": result.receipt_hashes,
        "net_obligations": [o.to_dict() for o in result.obligations],
        "netting_hash": netting_hash,
    }

    canonical_bytes = canonicalize_bytes(ian_data)
    ian_hash = hash_bytes(canonical_bytes)
    signature = sign(ian_hash, kernel_private_key)

    return IAN(
        ian_version="0.1",
        epoch_id=epoch_id,
        participants=result.participants,
        included_receipt_hashes=result.receipt_hashes,
        net_obligations=result.obligations,
        netting_hash=netting_hash,
        signature_ed25519=signature,
    )


def verify_ian(ian: IAN, kernel_public_key: str) -> Tuple[bool, Optional[str]]:
    """
    Verify an IAN.
    Returns (valid, error_message).
    """
    if ian.ian_version != "0.1":
        return False, "Invalid ian_version"

    # Verify participants
    for obl in ian.net_obligations:
        if obl.from_agent not in ian.participants:
            return False, f"Unknown participant: {obl.from_agent}"
        if obl.to_agent not in ian.participants:
            return False, f"Unknown participant: {obl.to_agent}"
        if obl.from_agent == obl.to_agent:
            return False, "Self-obligation not allowed"
        if obl.amount_usd_micros <= 0:
            return False, "Obligation amount must be positive"

    # Verify netting hash
    expected_hash = compute_netting_hash(
        ian.epoch_id, ian.included_receipt_hashes, ian.net_obligations
    )
    if ian.netting_hash != expected_hash:
        return False, "Invalid netting hash"

    # Verify signature
    ian_dict = ian.to_dict()
    del ian_dict["signature_ed25519"]
    ian_hash = hash_bytes(canonicalize_bytes(ian_dict))

    if not verify(ian_hash, ian.signature_ed25519, kernel_public_key):
        return False, "Invalid kernel signature"

    return True, None
