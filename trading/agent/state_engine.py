"""State engine — turn a live order book into one compact numeric snapshot.

Everything the decision engine sees is computed HERE, in deterministic code:
mid, spread, imbalance, realized volatility, inventory, drawdown. The model never
computes these. Timestamps are strictly causal: a snapshot at time ``ts`` may
only use inputs with timestamp ``<= ts`` (see ``compute_snapshot``), so no field
can leak from the future.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class OrderBookLevel:
    price: float
    size: float


@dataclass(frozen=True)
class OrderBook:
    ts: float                     # exchange timestamp of this book
    bids: tuple[OrderBookLevel, ...]   # sorted best -> worse (high price first)
    asks: tuple[OrderBookLevel, ...]   # sorted best -> worse (low price first)


@dataclass(frozen=True)
class PositionState:
    inventory: float              # signed units currently held (+long / -short)
    equity: float                 # current account equity (quote ccy)
    peak_equity: float            # high-water mark of equity


@dataclass(frozen=True)
class StateSnapshot:
    """Compact, causal snapshot. Small by construction (well under 400 tokens)."""
    ts: float
    mid: float
    spread: float                 # absolute (best_ask - best_bid)
    spread_bps: float             # spread in basis points of mid
    imbalance: float              # (bidvol - askvol) / (bidvol + askvol), [-1, 1]
    realized_vol: float           # stdev of recent log returns (per-sample)
    inventory: float
    drawdown: float               # (peak - equity) / peak, >= 0

    def to_dict(self) -> dict:
        return asdict(self)


def _top_n_volume(levels: tuple[OrderBookLevel, ...], n: int) -> float:
    return sum(l.size for l in levels[:n])


def realized_vol(prices: list[float]) -> float:
    """Std-dev of log returns over the supplied price series. 0 if <2 points."""
    if len(prices) < 2:
        return 0.0
    rets = []
    for a, b in zip(prices, prices[1:]):
        if a > 0 and b > 0:
            rets.append(math.log(b / a))
    if len(rets) < 2:
        return 0.0
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return math.sqrt(var)


def compute_snapshot(
    book: OrderBook,
    position: PositionState,
    recent_mids: list[float],
    *,
    now_ts: float,
    depth: int = 5,
) -> StateSnapshot:
    """Build the snapshot the decision engine will score.

    Causality guard: refuses a book stamped in the future relative to ``now_ts``.
    ``recent_mids`` must be the causal history (mids at times <= now_ts); the
    caller is responsible for not appending the future.
    """
    if book.ts > now_ts:
        raise ValueError(
            f"order book ts {book.ts} is in the future relative to now {now_ts} "
            "— refusing to build a snapshot from future data")
    if not book.bids or not book.asks:
        raise ValueError("order book must have at least one bid and one ask")

    best_bid = book.bids[0].price
    best_ask = book.asks[0].price
    if best_ask <= 0 or best_bid <= 0:
        raise ValueError("non-positive price in order book")

    mid = (best_bid + best_ask) / 2.0
    spread = best_ask - best_bid
    spread_bps = (spread / mid) * 1e4 if mid > 0 else 0.0

    bid_vol = _top_n_volume(book.bids, depth)
    ask_vol = _top_n_volume(book.asks, depth)
    denom = bid_vol + ask_vol
    imbalance = (bid_vol - ask_vol) / denom if denom > 0 else 0.0

    rv = realized_vol(recent_mids)

    peak = max(position.peak_equity, position.equity)
    drawdown = (peak - position.equity) / peak if peak > 0 else 0.0

    return StateSnapshot(
        ts=now_ts,
        mid=round(mid, 8),
        spread=round(spread, 8),
        spread_bps=round(spread_bps, 4),
        imbalance=round(imbalance, 6),
        realized_vol=round(rv, 8),
        inventory=round(position.inventory, 8),
        drawdown=round(drawdown, 6),
    )
