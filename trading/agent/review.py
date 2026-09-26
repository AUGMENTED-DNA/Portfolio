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


@dataclass(frozen=True)
class BlockRecord:
    """One block, as seen after the session. ``mid`` is the price at the block;
    grading looks ``horizon`` blocks forward to see if the direction was right."""
    direction: str           # "long" | "short" | "neutral"
    confidence: float
    mid: float


def grade_session(records: list[BlockRecord], *, horizon: int = 5,
                  min_move: float = 0.0) -> list[Outcome]:
    """Post-hoc grading (EVALUATION ONLY — never fed back into live decisions).

    For each block with a directional judgement, look ``horizon`` blocks ahead:
    the call is 'correct' if price moved in the predicted direction by more than
    ``min_move`` (absolute). Neutral blocks and blocks without a full forward
    window are skipped. This is what feeds the Brier score.
    """
    outcomes: list[Outcome] = []
    n = len(records)
    for i, r in enumerate(records):
        if r.direction not in ("long", "short"):
            continue
        j = i + horizon
        if j >= n:
            break
        move = records[j].mid - r.mid
        if abs(move) <= min_move:
            correct = False               # no meaningful move => the call didn't pay
        elif r.direction == "long":
            correct = move > 0
        else:                              # short
            correct = move < 0
        outcomes.append(Outcome(confidence=r.confidence, correct=correct))
    return outcomes


def records_from_log(log) -> list[BlockRecord]:
    """Extract BlockRecords from a session log (list of StepResult). Uses each
    block's RAW engine decision, so calibration grades the engine itself, not the
    post-escalation hold. Duck-typed to avoid an import cycle."""
    records = []
    for s in log:
        d = s.raw_decision or s.decision
        records.append(BlockRecord(direction=d.direction, confidence=d.confidence, mid=s.mid))
    return records


def run_review(records: list[BlockRecord], *, horizon: int = 5) -> dict:
    """Roll a session up into the numbers the overnight review reports. Measures
    only; it never rewrites or ships a schema (that stays human-approved)."""
    outcomes = grade_session(records, horizon=horizon)
    return {
        "graded": len(outcomes),
        "horizon": horizon,
        "brier": round(brier_score(outcomes), 4),
        "hit_rate": round(sum(1 for o in outcomes if o.correct) / len(outcomes), 4)
                    if outcomes else None,
        "calibration": calibration_report(outcomes),
    }


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
