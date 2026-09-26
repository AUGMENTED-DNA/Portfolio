"""Hard deterministic risk layer — the decision engine can never override this.

Every proposed order passes through ``RiskEngine.check`` first. The limits here
are absolute: max drawdown, max position, max daily loss, and an armed kill
switch checked before every order. No confidence score, regime, or model output
can bypass them. This is the part of the spec that MUST live in code, not in the
model.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RiskLimits:
    max_drawdown: float = 0.15        # 15% peak-to-trough equity, hard stop
    max_position: float = 1.0         # max absolute inventory (units)
    max_daily_loss: float = 0.05      # 5% of start-of-day equity
    kill_switch_armed: bool = False   # if True, block ALL orders


@dataclass(frozen=True)
class AccountState:
    equity: float
    peak_equity: float
    start_of_day_equity: float
    inventory: float


@dataclass(frozen=True)
class ProposedOrder:
    side: str                         # "buy" | "sell"
    size: float                       # >= 0, absolute units


@dataclass(frozen=True)
class RiskDecision:
    allowed: bool
    reason: str
    risk_state: str                   # "safe" | "near_limit" | "reduce" | "halt"


class RiskEngine:
    def __init__(self, limits: RiskLimits):
        self.limits = limits

    def _projected_inventory(self, acct: AccountState, order: ProposedOrder) -> float:
        delta = order.size if order.side == "buy" else -order.size
        return acct.inventory + delta

    def current_risk_state(self, acct: AccountState) -> str:
        """Coarse posture from drawdown, independent of any model view."""
        peak = max(acct.peak_equity, acct.equity)
        dd = (peak - acct.equity) / peak if peak > 0 else 0.0
        if dd >= self.limits.max_drawdown:
            return "halt"
        if dd >= self.limits.max_drawdown * 0.8:
            return "reduce"
        if dd >= self.limits.max_drawdown * 0.5:
            return "near_limit"
        return "safe"

    def check(self, acct: AccountState, order: ProposedOrder) -> RiskDecision:
        """The single gate every order must pass. Deny-by-limit, never override."""
        if self.limits.kill_switch_armed:
            return RiskDecision(False, "kill switch armed", "halt")

        if order.size < 0:
            return RiskDecision(False, "negative order size", "halt")

        peak = max(acct.peak_equity, acct.equity)
        drawdown = (peak - acct.equity) / peak if peak > 0 else 0.0
        if drawdown >= self.limits.max_drawdown:
            return RiskDecision(
                False, f"max drawdown breached ({drawdown:.1%} >= "
                       f"{self.limits.max_drawdown:.0%})", "halt")

        daily_loss = 0.0
        if acct.start_of_day_equity > 0:
            daily_loss = (acct.start_of_day_equity - acct.equity) / acct.start_of_day_equity
        if daily_loss >= self.limits.max_daily_loss:
            return RiskDecision(
                False, f"max daily loss breached ({daily_loss:.1%} >= "
                       f"{self.limits.max_daily_loss:.0%})", "reduce")

        projected = self._projected_inventory(acct, order)
        if abs(projected) > self.limits.max_position + 1e-12:
            return RiskDecision(
                False, f"max position breached (|{projected:.4f}| > "
                       f"{self.limits.max_position})", "reduce")

        return RiskDecision(True, "ok", self.current_risk_state(acct))
