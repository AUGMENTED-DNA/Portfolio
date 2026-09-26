"""Overnight review — calibration via Brier score.

The spec's self-improvement loop: read the session, measure how well the decision
engine's stated confidence matched outcomes. A lower Brier score is better
(0 = perfect, 0.25 = always guessing 0.5, 1 = confidently wrong). This module
only MEASURES; it never auto-ships a new schema. Rewriting/shipping is a gated,
human-approved step.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Outcome:
    confidence: float        # engine's stated P(direction correct), 0..1
    correct: bool            # did the trade's direction turn out right?


def brier_score(outcomes: list[Outcome]) -> float:
    """Mean squared error of confidence vs. realized outcome. None-safe: returns
    0.0 for an empty list (nothing to grade)."""
    if not outcomes:
        return 0.0
    total = 0.0
    for o in outcomes:
        y = 1.0 if o.correct else 0.0
        total += (o.confidence - y) ** 2
    return total / len(outcomes)


def calibration_report(outcomes: list[Outcome], bins: int = 5) -> list[dict]:
    """Bucket confidences and compare stated vs. realized hit-rate per bucket —
    the raw material for deciding whether the engine is over/under-confident."""
    if not outcomes:
        return []
    buckets: list[list[Outcome]] = [[] for _ in range(bins)]
    for o in outcomes:
        idx = min(int(o.confidence * bins), bins - 1)
        buckets[idx].append(o)
    report = []
    for i, b in enumerate(buckets):
        lo, hi = i / bins, (i + 1) / bins
        if not b:
            report.append({"range": f"{lo:.1f}-{hi:.1f}", "n": 0,
                           "stated": None, "realized": None})
            continue
        stated = sum(o.confidence for o in b) / len(b)
        realized = sum(1 for o in b if o.correct) / len(b)
        report.append({"range": f"{lo:.1f}-{hi:.1f}", "n": len(b),
                       "stated": round(stated, 3), "realized": round(realized, 3)})
    return report
