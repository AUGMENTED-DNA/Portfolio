"""The typed decision schema and the decision-engine interface.

This mirrors the spec's Jev schema. The decision engine ONLY judges — it returns
a typed, calibrated view of the current snapshot. It does not size, does not
place orders, and cannot override risk. All of that lives in policy.py / risk.py.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from .state_engine import StateSnapshot

Regime = Literal["trending", "mean_reverting", "high_vol", "crisis"]
Direction = Literal["long", "short", "neutral"]
RiskState = Literal["safe", "near_limit", "reduce"]


@dataclass(frozen=True)
class Decision:
    """Typed, calibrated judgement of one snapshot (the spec's Jev schema)."""
    regime: Regime
    direction: Direction
    toxic_flow: bool                 # is order flow adverse/toxic right now?
    setup_quality: int               # 0..3
    risk_state: RiskState            # engine's *view*; the hard risk layer decides
    confidence: float                # calibrated P(direction is right), 0..1

    def __post_init__(self) -> None:
        if not (0 <= self.setup_quality <= 3):
            raise ValueError("setup_quality must be in 0..3")
        if not (0.0 <= self.confidence <= 1.0):
            raise ValueError("confidence must be in 0..1")


class DecisionEngine(Protocol):
    """Anything that scores a snapshot into a Decision. Swap implementations
    freely — the gate and risk layer treat every engine the same."""

    def decide(self, snapshot: StateSnapshot) -> Decision: ...


class StubDecisionEngine:
    """A LOCAL, DETERMINISTIC PLACEHOLDER WITH NO TRADING EDGE.

    It exists only to exercise the plumbing (state -> decision -> gate -> risk ->
    paper broker) in tests and backtests. Do not mistake it for a strategy. A
    real decision engine must be supplied and validated before this system is
    anything more than plumbing.
    """

    def __init__(self, *, vol_crisis: float = 0.05, vol_high: float = 0.02):
        self.vol_crisis = vol_crisis
        self.vol_high = vol_high

    def decide(self, s: StateSnapshot) -> Decision:
        # Regime purely from realized vol / drawdown — a toy proxy, not an edge.
        if s.drawdown >= 0.15 or s.realized_vol >= self.vol_crisis:
            regime: Regime = "crisis"
        elif s.realized_vol >= self.vol_high:
            regime = "high_vol"
        elif abs(s.imbalance) >= 0.3:
            regime = "trending"
        else:
            regime = "mean_reverting"

        # Toy direction from book imbalance; confidence scales with |imbalance|.
        if s.imbalance > 0.15:
            direction: Direction = "long"
        elif s.imbalance < -0.15:
            direction = "short"
        else:
            direction = "neutral"

        confidence = min(0.5 + abs(s.imbalance), 0.99)
        toxic_flow = s.spread_bps > 25.0            # wide spread ~ adverse
        setup_quality = 0
        if direction != "neutral" and not toxic_flow:
            setup_quality = 3 if abs(s.imbalance) >= 0.35 else 2 if abs(s.imbalance) >= 0.25 else 1

        if regime == "crisis" or s.drawdown >= 0.12:
            risk_state: RiskState = "reduce"
        elif s.drawdown >= 0.08:
            risk_state = "near_limit"
        else:
            risk_state = "safe"

        return Decision(
            regime=regime,
            direction=direction,
            toxic_flow=toxic_flow,
            setup_quality=setup_quality,
            risk_state=risk_state,
            confidence=round(confidence, 4),
        )


class JevDecisionEngine:
    """UNWIRED PLACEHOLDER for an external real-time decision service ("Jev").

    Intentionally NOT connected. The service named in the spec
    (console.typesafe.ai / typesafe.ai) is unverified, and this scaffold makes no
    outbound calls. To use a real engine, implement `decide()` against a service
    you have independently verified, supply the credential out-of-band, and only
    then remove the guard below. It refuses to run until then.
    """

    def __init__(self, api_key: str | None = None, endpoint: str | None = None):
        self.api_key = api_key
        self.endpoint = endpoint

    def decide(self, snapshot: StateSnapshot) -> Decision:  # pragma: no cover
        raise NotImplementedError(
            "JevDecisionEngine is an unwired placeholder. No external decision "
            "service is integrated in this scaffold. Provide a verified adapter "
            "before enabling it."
        )
