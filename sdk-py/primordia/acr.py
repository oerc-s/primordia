"""
P5: ACR - Agent Credit Rating
Deterministic 6D vector computed from MSR history
Non-anthropomorphic. Pure math.
"""

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from collections import defaultdict

from .msr import MSR


@dataclass
class ACRDimensions:
    volume_usd_micros: int = 0           # V: Total value
    velocity_per_day: float = 0.0        # Ω: Transactions/day
    settlement_ratio: float = 1.0        # σ: Settled/total
    counterparty_entropy: float = 0.0    # H: Diversity
    netting_efficiency: float = 0.0      # η: Compression ratio
    temporal_consistency: float = 1.0    # τ: Behavioral stability


@dataclass
class ACR:
    agent_id: str
    acr_version: str
    computed_at_ms: int
    window_start_ms: int
    window_end_ms: int
    msr_count: int
    dimensions: ACRDimensions
    raw_data_hash: str

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "acr_version": self.acr_version,
            "computed_at_ms": self.computed_at_ms,
            "window_start_ms": self.window_start_ms,
            "window_end_ms": self.window_end_ms,
            "msr_count": self.msr_count,
            "dimensions": {
                "volume_usd_micros": self.dimensions.volume_usd_micros,
                "velocity_per_day": self.dimensions.velocity_per_day,
                "settlement_ratio": self.dimensions.settlement_ratio,
                "counterparty_entropy": self.dimensions.counterparty_entropy,
                "netting_efficiency": self.dimensions.netting_efficiency,
                "temporal_consistency": self.dimensions.temporal_consistency,
            },
            "raw_data_hash": self.raw_data_hash,
        }


class ACRComputer:
    """
    Streaming ACR computer - O(n) single pass
    Designed for exponential scale
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.msrs: List[MSR] = []
        self.total_volume = 0
        self.counterparty_counts: Dict[str, int] = defaultdict(int)
        self.daily_volumes: Dict[str, int] = defaultdict(int)
        self.settled_count = 0
        self.min_ts = float('inf')
        self.max_ts = 0

    def add_msr(self, msr: MSR, settled: bool = True) -> None:
        """Add MSR to computation - O(1) per MSR"""
        self.msrs.append(msr)

        # V: Volume
        self.total_volume += msr.price_usd_micros

        # Counterparty tracking for H
        counterparty = (
            msr.payee_agent_id if msr.payer_agent_id == self.agent_id
            else msr.payer_agent_id
        )
        self.counterparty_counts[counterparty] += 1

        # Daily volume for τ
        day = str(msr.timestamp_ms // 86400000)
        self.daily_volumes[day] += msr.price_usd_micros

        # σ: Settlement tracking
        if settled:
            self.settled_count += 1

        # Time bounds
        self.min_ts = min(self.min_ts, msr.timestamp_ms)
        self.max_ts = max(self.max_ts, msr.timestamp_ms)

    def compute(self, raw_data_hash: str) -> ACR:
        """Compute final ACR - O(c + d) where c=counterparties, d=days"""
        import time

        count = len(self.msrs)
        if count == 0:
            return self._empty_acr(raw_data_hash)

        time_span_days = max(1, (self.max_ts - self.min_ts) / 86400000)

        return ACR(
            agent_id=self.agent_id,
            acr_version="0.1",
            computed_at_ms=int(time.time() * 1000),
            window_start_ms=int(self.min_ts),
            window_end_ms=int(self.max_ts),
            msr_count=count,
            dimensions=ACRDimensions(
                volume_usd_micros=self.total_volume,
                velocity_per_day=count / time_span_days,
                settlement_ratio=self.settled_count / count,
                counterparty_entropy=self._compute_entropy(),
                netting_efficiency=0,  # Requires netting data
                temporal_consistency=self._compute_temporal_consistency(),
            ),
            raw_data_hash=raw_data_hash,
        )

    def _compute_entropy(self) -> float:
        """Shannon entropy of counterparty distribution"""
        total = len(self.msrs)
        if total == 0:
            return 0

        entropy = 0.0
        for count in self.counterparty_counts.values():
            p = count / total
            if p > 0:
                entropy -= p * math.log2(p)
        return entropy

    def _compute_temporal_consistency(self) -> float:
        """1 - coefficient of variation of daily volumes"""
        volumes = list(self.daily_volumes.values())
        if len(volumes) < 2:
            return 1.0

        mean = sum(volumes) / len(volumes)
        if mean == 0:
            return 1.0

        variance = sum((v - mean) ** 2 for v in volumes) / len(volumes)
        stddev = math.sqrt(variance)

        return 1 - (stddev / mean)

    def _empty_acr(self, raw_data_hash: str) -> ACR:
        import time
        now = int(time.time() * 1000)
        return ACR(
            agent_id=self.agent_id,
            acr_version="0.1",
            computed_at_ms=now,
            window_start_ms=now,
            window_end_ms=now,
            msr_count=0,
            dimensions=ACRDimensions(),
            raw_data_hash=raw_data_hash,
        )

    def reset(self) -> None:
        """Reset for new computation window"""
        self.msrs = []
        self.total_volume = 0
        self.counterparty_counts.clear()
        self.daily_volumes.clear()
        self.settled_count = 0
        self.min_ts = float('inf')
        self.max_ts = 0


def compute_acr(agent_id: str, msrs: List[MSR], raw_data_hash: str) -> ACR:
    """Compute ACR from MSR list - convenience function"""
    computer = ACRComputer(agent_id)
    for msr in msrs:
        computer.add_msr(msr)
    return computer.compute(raw_data_hash)


@dataclass
class ACRPolicy:
    """Policy-based ACR evaluation - agents define their own thresholds"""
    min_volume_usd_micros: Optional[int] = None
    min_velocity_per_day: Optional[float] = None
    min_settlement_ratio: Optional[float] = None
    min_counterparty_entropy: Optional[float] = None
    min_netting_efficiency: Optional[float] = None
    min_temporal_consistency: Optional[float] = None


def evaluate_acr(acr: ACR, policy: ACRPolicy) -> bool:
    """Check if ACR meets policy thresholds"""
    d = acr.dimensions

    if policy.min_volume_usd_micros is not None:
        if d.volume_usd_micros < policy.min_volume_usd_micros:
            return False

    if policy.min_velocity_per_day is not None:
        if d.velocity_per_day < policy.min_velocity_per_day:
            return False

    if policy.min_settlement_ratio is not None:
        if d.settlement_ratio < policy.min_settlement_ratio:
            return False

    if policy.min_counterparty_entropy is not None:
        if d.counterparty_entropy < policy.min_counterparty_entropy:
            return False

    if policy.min_netting_efficiency is not None:
        if d.netting_efficiency < policy.min_netting_efficiency:
            return False

    if policy.min_temporal_consistency is not None:
        if d.temporal_consistency < policy.min_temporal_consistency:
            return False

    return True


def merge_acrs(acrs: List[ACR]) -> ACR:
    """Merge multiple ACRs (for sharded computation)"""
    import time

    if not acrs:
        raise ValueError("Cannot merge empty ACR list")
    if len(acrs) == 1:
        return acrs[0]

    agent_id = acrs[0].agent_id
    total_volume = 0
    total_count = 0
    total_settled = 0
    min_ts = float('inf')
    max_ts = 0

    for acr in acrs:
        total_volume += acr.dimensions.volume_usd_micros
        total_count += acr.msr_count
        total_settled += acr.dimensions.settlement_ratio * acr.msr_count
        min_ts = min(min_ts, acr.window_start_ms)
        max_ts = max(max_ts, acr.window_end_ms)

    time_span_days = max(1, (max_ts - min_ts) / 86400000)

    # Weighted average for non-mergeable dimensions
    weighted_entropy = 0.0
    weighted_consistency = 0.0
    for acr in acrs:
        weight = acr.msr_count / total_count if total_count > 0 else 0
        weighted_entropy += acr.dimensions.counterparty_entropy * weight
        weighted_consistency += acr.dimensions.temporal_consistency * weight

    return ACR(
        agent_id=agent_id,
        acr_version="0.1",
        computed_at_ms=int(time.time() * 1000),
        window_start_ms=int(min_ts),
        window_end_ms=int(max_ts),
        msr_count=total_count,
        dimensions=ACRDimensions(
            volume_usd_micros=total_volume,
            velocity_per_day=total_count / time_span_days,
            settlement_ratio=total_settled / total_count if total_count > 0 else 1.0,
            counterparty_entropy=weighted_entropy,
            netting_efficiency=0,  # Requires re-netting
            temporal_consistency=weighted_consistency,
        ),
        raw_data_hash="merged",
    )
