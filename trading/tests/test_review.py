"""Tests for the session grader / nightly review loop."""
from agent.review import (BlockRecord, grade_session, run_review, brier_score,
                          Outcome)


def test_grade_session_marks_direction_correctly():
    # rising price: long is right, short is wrong; horizon=1
    recs = [
        BlockRecord("long", 0.9, 100.0),
        BlockRecord("short", 0.9, 101.0),
        BlockRecord("neutral", 0.5, 102.0),   # skipped
        BlockRecord("long", 0.9, 103.0),      # no forward window at horizon=1? has one
        BlockRecord("long", 0.9, 104.0),      # last -> skipped (no future)
    ]
    outs = grade_session(recs, horizon=1)
    # graded: idx0 long (100->101 up => correct), idx1 short (101->102 up => wrong),
    # idx3 long (103->104 up => correct). idx2 neutral skipped, idx4 no future.
    assert [o.correct for o in outs] == [True, False, True]

def test_grade_skips_when_no_forward_window():
    recs = [BlockRecord("long", 0.9, 100.0), BlockRecord("long", 0.9, 101.0)]
    assert grade_session(recs, horizon=5) == []      # never enough lookahead

def test_flat_move_counts_as_incorrect():
    recs = [BlockRecord("long", 0.9, 100.0), BlockRecord("long", 0.9, 100.0)]
    outs = grade_session(recs, horizon=1)
    assert outs and outs[0].correct is False

def test_run_review_rolls_up_brier_and_hitrate():
    recs = [
        BlockRecord("long", 0.8, 100.0),
        BlockRecord("long", 0.8, 101.0),   # 100->101 correct (graded at horizon 1)
        BlockRecord("long", 0.8, 100.0),   # 101->100 down => wrong
        BlockRecord("long", 0.8, 101.0),
    ]
    rep = run_review(recs, horizon=1)
    assert rep["graded"] == 3
    assert rep["hit_rate"] is not None
    assert 0.0 <= rep["brier"] <= 1.0

def test_run_review_empty():
    rep = run_review([], horizon=5)
    assert rep["graded"] == 0 and rep["hit_rate"] is None and rep["brier"] == 0.0
