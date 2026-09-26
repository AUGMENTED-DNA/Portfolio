"""Market-data adapters — where order books come from.

All feeds yield OrderBook snapshots in strictly non-decreasing timestamp order,
so the loop's causality guarantee holds. NONE of these open a live network
connection in this scaffold: SyntheticFeed is deterministic, ReplayFeed reads a
local file. A live read-only feed would implement the same DataFeed protocol.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator, Protocol

from .state_engine import OrderBook, OrderBookLevel


class DataFeed(Protocol):
    def stream(self) -> Iterator[OrderBook]: ...


class SyntheticFeed:
    """Deterministic synthetic books (fixed seed). For tests and plumbing runs."""

    def __init__(self, n: int = 300, seed: int = 7):
        self.n = n
        self.seed = seed

    def stream(self) -> Iterator[OrderBook]:
        import random
        rng = random.Random(self.seed)
        price = 100.0
        for i in range(self.n):
            price *= (1.0 + rng.gauss(0, 0.004))
            spread = max(0.01, price * 0.0006)
            bid, ask = price - spread / 2, price + spread / 2
            bids = tuple(OrderBookLevel(bid - k * 0.01, rng.uniform(0.5, 3.0)) for k in range(5))
            asks = tuple(OrderBookLevel(ask + k * 0.01, rng.uniform(0.5, 3.0)) for k in range(5))
            yield OrderBook(ts=float(i), bids=bids, asks=asks)


class ReplayFeed:
    """Replay recorded order books from a JSON file. Each row:
        {"ts": <float>, "bids": [[price, size], ...], "asks": [[price, size], ...]}
    Enforces non-decreasing ts so replayed data can't leak from the future.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)

    def stream(self) -> Iterator[OrderBook]:
        rows = json.loads(self.path.read_text())
        last_ts = float("-inf")
        for row in rows:
            ts = float(row["ts"])
            if ts < last_ts:
                raise ValueError(f"replay ts went backwards: {ts} < {last_ts}")
            last_ts = ts
            bids = tuple(OrderBookLevel(float(p), float(s)) for p, s in row["bids"])
            asks = tuple(OrderBookLevel(float(p), float(s)) for p, s in row["asks"])
            yield OrderBook(ts=ts, bids=bids, asks=asks)
