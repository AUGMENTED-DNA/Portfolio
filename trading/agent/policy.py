"""Gate + sizing — deterministic, on top of the decision engine's judgement.

Fire only when the spec's conditions hold, then size with fractional Kelly from
the engine's calibrated probability, capped at quarter Kelly. This never places
an order itself; it produces an intent the risk layer must still approve.
"""
from __future__ import annotations

from dataclasses import dataclass

from .decision import Decision

# Spec thresholds — owned by code, not the model.
MIN_SETUP_QUALITY = 2
MIN_CONFIDENCE = 0.80
KELLY_CAP = 0.25          # never exceed quarter Kelly


@dataclass(frozen=True)
class OrderIntent:
    side: str                # "buy" | "sell"
    size: float              # absolute units, >= 0
    reason: str


def passes_gate(d: Decision) -> tuple[bool, str]:
    """The spec's entry gate. Returns (ok, reason)."""
    if d.direction == "neutral":
        return False, "direction neutral"
    if d.toxic_flow:
        return False, "toxic flow"
    if d.setup_quality < MIN_SETUP_QUALITY:
        return False, f"setup_quality {d.setup_quality} < {MIN_SETUP_QUALITY}"
    if d.confidence <= MIN_CONFIDENCE:
        return False, f"confidence {d.confidence:.2f} <= {MIN_CONFIDENCE}"
    if d.risk_state != "safe":
        return False, f"risk_state {d.risk_state} != safe"
    return True, "gate passed"


def kelly_fraction(p: float, payoff_ratio: float = 1.0) -> float:
    """Full Kelly fraction of bankroll for a bet with win prob ``p`` and win/loss
    payoff ratio ``b`` (default 1:1). Clamped to [0, 1]. Returns 0 for a
    non-positive edge."""
    if not (0.0 < p < 1.0) or payoff_ratio <= 0:
        return 0.0
    q = 1.0 - p
    f = (payoff_ratio * p - q) / payoff_ratio      # classic Kelly
    return max(0.0, min(1.0, f))


def target_size(
    d: Decision,
    bankroll: float,
    price: float,
    *,
    payoff_ratio: float = 1.0,
    kelly_cap: float = KELLY_CAP,
) -> float:
    """Units to trade, from capped fractional Kelly on the calibrated probability.
    Returns 0 if inputs are unusable."""
    if bankroll <= 0 or price <= 0:
        return 0.0
    full = kelly_fraction(d.confidence, payoff_ratio)
    frac = min(full, kelly_cap)                    # cap at quarter Kelly
    notional = frac * bankroll
    return max(0.0, notional / price)


def decide_order(d: Decision, bankroll: float, price: float) -> OrderIntent | None:
    """End-to-end: gate, then size. Returns None if the gate blocks or size is 0.
    The risk layer must still approve the returned intent."""
    ok, reason = passes_gate(d)
    if not ok:
        return None
    size = target_size(d, bankroll, price)
    if size <= 0:
        return None
    side = "buy" if d.direction == "long" else "sell"
    return OrderIntent(side=side, size=size, reason=f"{reason}; conf={d.confidence:.2f}")
