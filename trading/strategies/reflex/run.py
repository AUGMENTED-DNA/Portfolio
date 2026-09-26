"""Run the Reflex agent, paper mode.

    python -m strategies.reflex.run                 # synthetic feed
    python -m strategies.reflex.run --replay FILE   # replay recorded books (JSON)

Paper only. No real orders, no keys, no outbound calls. Prints the session
summary and the nightly calibration review.
"""
from __future__ import annotations

import sys

from agent.data_feed import ReplayFeed, SyntheticFeed
from agent.review import records_from_log, run_review
from agent.runner import run_session

from .config import ReflexConfig, build_components


def run(feed, config: ReflexConfig | None = None):
    cfg, engine, risk, broker = build_components(config)
    return cfg, run_session(feed, engine, risk, broker,
                            start_equity=cfg.start_equity, keep_log=True)


def main(argv: list[str] | None = None) -> None:
    argv = argv if argv is not None else sys.argv[1:]
    if "--replay" in argv:
        path = argv[argv.index("--replay") + 1]
        feed, label = ReplayFeed(path), f"replay {path}"
    else:
        feed, label = SyntheticFeed(), "synthetic"

    cfg, session = run(feed)
    print(f"Reflex [{cfg.name}] paper run ({label}; engine={cfg.engine}):")
    if cfg.engine == "stub":
        print("  (StubDecisionEngine — NO EDGE, plumbing check only)")
    for k, v in session.summary().items():
        print(f"  {k:16} {v}")

    review = run_review(records_from_log(session.log))
    print("\nNightly review (calibration — MEASURES ONLY, no auto-ship):")
    for k in ("graded", "horizon", "brier", "hit_rate"):
        print(f"  {k:16} {review[k]}")
    print("\nNote: reproducible plumbing test, not a strategy result.")


if __name__ == "__main__":
    main()
