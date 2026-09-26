"""Session runner — drive any DataFeed through the loop into any Broker.

This is the reusable engine behind both the backtest and any (paper/testnet)
dry-run. It owns the causal bookkeeping: it only ever feeds the loop the mids it
has already seen. It never places real orders itself — that is the broker's job,
and the only brokers wired here are paper/testnet.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .data_feed import DataFeed
from .decision import DecisionEngine
from .loop import BrainHook, StepResult, step
from .risk import AccountState, RiskEngine
from .state_engine import PositionState, compute_snapshot


@dataclass
class SessionResult:
    blocks: int = 0
    trades: int = 0
    escalations: int = 0
    start_equity: float = 0.0
    final_equity: float = 0.0
    return_pct: float = 0.0
    final_inventory: float = 0.0
    log: list[StepResult] = field(default_factory=list)

    def summary(self) -> dict:
        return {
            "blocks": self.blocks,
            "trades": self.trades,
            "escalations": self.escalations,
            "start_equity": round(self.start_equity, 2),
            "final_equity": round(self.final_equity, 2),
            "return_pct": round(self.return_pct, 3),
            "final_inventory": round(self.final_inventory, 4),
        }


def run_session(
    feed: DataFeed,
    engine: DecisionEngine,
    risk: RiskEngine,
    broker,                          # Broker (duck-typed)
    *,
    start_equity: float,
    brain_hook: Optional[BrainHook] = None,
    keep_log: bool = False,
) -> SessionResult:
    res = SessionResult(start_equity=start_equity)
    peak = start_equity
    mids: list[float] = []

    for book in feed.stream():
        mid = (book.bids[0].price + book.asks[0].price) / 2
        mids.append(mid)                          # causal history only
        equity = broker.equity(mid)
        peak = max(peak, equity)

        snapshot = compute_snapshot(
            book,
            PositionState(inventory=broker.inventory, equity=equity, peak_equity=peak),
            mids[-30:],
            now_ts=book.ts,
        )
        account = AccountState(equity=equity, peak_equity=peak,
                               start_of_day_equity=start_equity, inventory=broker.inventory)
        step_res = step(snapshot, engine, risk, account, bankroll=equity,
                        broker=broker, brain_hook=brain_hook)
        res.blocks += 1
        res.trades += int(step_res.acted)
        res.escalations += int(step_res.escalated)
        if keep_log:
            res.log.append(step_res)

    final_mid = mids[-1] if mids else 0.0
    res.final_equity = broker.equity(final_mid) if mids else start_equity
    res.return_pct = (res.final_equity / start_equity - 1) * 100 if start_equity else 0.0
    res.final_inventory = broker.inventory
    return res
