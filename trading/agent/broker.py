"""Broker adapters — where orders go.

The whole system talks to a broker only through the ``Broker`` protocol, so the
loop cannot tell paper from testnet from live. Two implementations are wired:
PaperBroker (in paper_broker.py) and — as an explicit, UNWIRED placeholder —
TestnetBroker. There is deliberately no live/mainnet broker in this scaffold.
"""
from __future__ import annotations

from typing import Protocol

from .paper_broker import Fill, PaperBroker  # re-exported for convenience

__all__ = ["Broker", "PaperBroker", "Fill", "TestnetBroker"]


class Broker(Protocol):
    inventory: float
    def market_order(self, side: str, size: float, mid: float, ts: float) -> Fill: ...
    def equity(self, mid: float) -> float: ...


class TestnetBroker:
    """UNWIRED placeholder for a paper-money EXCHANGE TESTNET adapter.

    A testnet moves only fake funds, but it still requires a network endpoint and
    testnet credentials, and those must be supplied and verified out-of-band. This
    scaffold makes no outbound calls, so the adapter refuses to run until a real,
    reviewed implementation replaces this body. It exists to prove the interface
    is honoured, not to trade.

    NOTE: even a fully implemented TestnetBroker must NEVER be pointed at a
    mainnet/real-money endpoint by config alone — that is a separate, explicit
    decision with its own review.
    """

    __test__ = False   # not a pytest test class despite the "Test" prefix

    def __init__(self, endpoint: str | None = None, api_key: str | None = None):
        self.endpoint = endpoint
        self.api_key = api_key
        self.inventory = 0.0

    def market_order(self, side: str, size: float, mid: float, ts: float) -> Fill:  # pragma: no cover
        raise NotImplementedError(
            "TestnetBroker is an unwired placeholder — no exchange testnet is "
            "connected in this scaffold. Supply a verified testnet endpoint and "
            "credentials and implement this method before using it."
        )

    def equity(self, mid: float) -> float:  # pragma: no cover
        raise NotImplementedError("TestnetBroker is not connected.")
