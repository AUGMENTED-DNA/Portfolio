"""Tests for the Reflex strategy wiring."""
import pytest

from agent.data_feed import SyntheticFeed
from strategies.reflex.config import ReflexConfig, build_components
from strategies.reflex.run import run


def test_build_components_defaults():
    cfg, engine, risk, broker = build_components()
    assert cfg.name == "reflex"
    assert risk.limits.max_drawdown == 0.15
    assert broker.cash == cfg.start_equity
    assert hasattr(engine, "decide")

def test_paper_is_the_only_wired_broker():
    with pytest.raises(ValueError):
        ReflexConfig(broker="testnet").build_broker()
    with pytest.raises(ValueError):
        ReflexConfig(broker="live").build_broker()

def test_jev_engine_selectable_but_unwired():
    eng = ReflexConfig(engine="jev").build_engine()
    from agent.state_engine import (OrderBook, OrderBookLevel, PositionState,
                                    compute_snapshot)
    snap = compute_snapshot(
        OrderBook(1.0, (OrderBookLevel(99.0, 1.0),), (OrderBookLevel(101.0, 1.0),)),
        PositionState(0.0, 100.0, 100.0), [], now_ts=1.0)
    with pytest.raises(NotImplementedError):
        eng.decide(snap)

def test_reflex_paper_session_runs():
    cfg, session = run(SyntheticFeed(n=80))
    assert cfg.name == "reflex"
    assert session.blocks == 80
    assert session.final_equity > 0
