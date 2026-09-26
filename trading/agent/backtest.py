"""Offline backtest — replay synthetic candles through the full paper pipeline.

Run: ``python -m agent.backtest``

Uses a deterministic synthetic price/order-book series (a fixed random seed) so
the run is reproducible and needs no network or data feed. This validates the
plumbing (state -> decision -> gate -> risk -> paper broker), NOT any edge: the
default engine is the no-edge StubDecisionEngine.
"""
from __future__ import annotations

import random

from .decision import StubDecisionEngine
from .loop import step
from .paper_broker import PaperBroker
from .risk import AccountState, RiskEngine, RiskLimits
from .state_engine import (OrderBook, OrderBookLevel, PositionState,
                           compute_snapshot)


def synthetic_books(n: int, seed: int = 7) -> list[OrderBook]:
    rng = random.Random(seed)
    price = 100.0
    books = []
    for i in range(n):
        price *= (1.0 + rng.gauss(0, 0.004))
        spread = max(0.01, price * 0.0006)
        bid = price - spread / 2
        ask = price + spread / 2
        # random-ish depth to move the imbalance around
        bsz = tuple(OrderBookLevel(bid - k * 0.01, rng.uniform(0.5, 3.0)) for k in range(5))
        asz = tuple(OrderBookLevel(ask + k * 0.01, rng.uniform(0.5, 3.0)) for k in range(5))
        books.append(OrderBook(ts=float(i), bids=bsz, asks=asz))
    return books


def run(n: int = 300) -> dict:
    books = synthetic_books(n)
    engine = StubDecisionEngine()
    risk = RiskEngine(RiskLimits(max_position=5.0))
    broker = PaperBroker(cash=10_000.0)

    start_equity = broker.cash
    peak = start_equity
    mids: list[float] = []
    acted = 0
    escalated = 0

    for book in books:
        mid = (book.bids[0].price + book.asks[0].price) / 2
        mids.append(mid)
        recent = mids[-30:]                      # causal history only
        equity = broker.equity(mid)
        peak = max(peak, equity)

        snapshot = compute_snapshot(
            book,
            PositionState(inventory=broker.inventory, equity=equity, peak_equity=peak),
            recent,
            now_ts=book.ts,
        )
        account = AccountState(equity=equity, peak_equity=peak,
                               start_of_day_equity=start_equity, inventory=broker.inventory)
        res = step(snapshot, engine, risk, account, bankroll=equity, broker=broker)
        acted += int(res.acted)
        escalated += int(res.escalated)

    final_mid = mids[-1]
    final_equity = broker.equity(final_mid)
    return {
        "blocks": n,
        "trades": acted,
        "escalations": escalated,
        "start_equity": round(start_equity, 2),
        "final_equity": round(final_equity, 2),
        "return_pct": round((final_equity / start_equity - 1) * 100, 3),
        "final_inventory": round(broker.inventory, 4),
    }


if __name__ == "__main__":
    result = run()
    print("Paper backtest (StubDecisionEngine — NO EDGE, plumbing check only):")
    for k, v in result.items():
        print(f"  {k:16} {v}")
    print("\nNote: this is a reproducible plumbing test, not a strategy result.")
