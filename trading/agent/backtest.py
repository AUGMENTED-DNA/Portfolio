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
from .review import records_from_log, run_review
from .risk import RiskEngine, RiskLimits
from .runner import run_session


def run(n: int = 300) -> dict:
    return run_session_with_feed(SyntheticFeed(n=n)).summary()


def run_session_with_feed(feed):
    engine = StubDecisionEngine()
    risk = RiskEngine(RiskLimits(max_position=5.0))
    broker = PaperBroker(cash=10_000.0)
    return run_session(feed, engine, risk, broker, start_equity=10_000.0, keep_log=True)


def main(argv: list[str] | None = None) -> None:
    argv = argv if argv is not None else sys.argv[1:]
    if "--replay" in argv:
        path = argv[argv.index("--replay") + 1]
        feed = ReplayFeed(path)
        label = f"replay {path}"
    else:
        feed = SyntheticFeed()
        label = "synthetic"

    session = run_session_with_feed(feed)
    print(f"Paper backtest ({label}; StubDecisionEngine — NO EDGE, plumbing check only):")
    for k, v in session.summary().items():
        print(f"  {k:16} {v}")

    # Overnight-style review: grade the engine's calibration over this session.
    review = run_review(records_from_log(session.log))
    print("\nNightly review (calibration — MEASURES ONLY, no auto-ship):")
    for k in ("graded", "horizon", "brier", "hit_rate"):
        print(f"  {k:16} {review[k]}")
    print("\nNote: this is a reproducible plumbing test, not a strategy result.")


if __name__ == "__main__":
    main()
