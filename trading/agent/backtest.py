"""Offline backtest / dry-run — replay a feed through the full paper pipeline.

Run:
    python -m agent.backtest                 # synthetic feed
    python -m agent.backtest --replay FILE   # replay recorded books (JSON)

Validates the plumbing (feed -> state -> decision -> gate -> risk -> paper
broker), NOT any edge: the default engine is the no-edge StubDecisionEngine and
the only broker is the paper broker. No network, no real money.
"""
from __future__ import annotations

import sys

from .data_feed import ReplayFeed, SyntheticFeed
from .decision import StubDecisionEngine
from .paper_broker import PaperBroker
from .risk import RiskEngine, RiskLimits
from .runner import run_session


def run(n: int = 300) -> dict:
    return run_with_feed(SyntheticFeed(n=n))


def run_with_feed(feed) -> dict:
    engine = StubDecisionEngine()
    risk = RiskEngine(RiskLimits(max_position=5.0))
    broker = PaperBroker(cash=10_000.0)
    return run_session(feed, engine, risk, broker, start_equity=10_000.0).summary()


def main(argv: list[str] | None = None) -> None:
    argv = argv if argv is not None else sys.argv[1:]
    if "--replay" in argv:
        path = argv[argv.index("--replay") + 1]
        feed = ReplayFeed(path)
        label = f"replay {path}"
    else:
        feed = SyntheticFeed()
        label = "synthetic"
    result = run_with_feed(feed)
    print(f"Paper backtest ({label}; StubDecisionEngine — NO EDGE, plumbing check only):")
    for k, v in result.items():
        print(f"  {k:16} {v}")
    print("\nNote: this is a reproducible plumbing test, not a strategy result.")


if __name__ == "__main__":
    main()
