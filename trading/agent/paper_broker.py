"""Simulated broker — fills orders on paper. NO real exchange, NO real money.

This is the only "execution" venue wired into the scaffold. It exists so the full
loop can run end to end offline. Swapping in a real exchange adapter is an
explicit, out-of-scope operator decision.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Fill:
    ts: float
    side: str
    size: float
    price: float


@dataclass
class PaperBroker:
    cash: float
    inventory: float = 0.0
    fee_bps: float = 5.0                     # round-trip friction proxy
    slippage_bps: float = 2.0
    fills: list[Fill] = field(default_factory=list)

    def market_order(self, side: str, size: float, mid: float, ts: float) -> Fill:
        if size <= 0 or mid <= 0:
            raise ValueError("size and mid must be positive")
        slip = mid * self.slippage_bps / 1e4
        price = mid + slip if side == "buy" else mid - slip
        fee = price * size * self.fee_bps / 1e4
        if side == "buy":
            self.cash -= price * size + fee
            self.inventory += size
        elif side == "sell":
            self.cash += price * size - fee
            self.inventory -= size
        else:
            raise ValueError(f"unknown side {side!r}")
        fill = Fill(ts=ts, side=side, size=size, price=round(price, 8))
        self.fills.append(fill)
        return fill

    def equity(self, mid: float) -> float:
        """Mark-to-market equity at the current mid."""
        return self.cash + self.inventory * mid
