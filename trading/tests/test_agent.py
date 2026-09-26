"""Unit tests for the deterministic safe layers."""
import math

import pytest

from agent.state_engine import (OrderBook, OrderBookLevel, PositionState,
                                compute_snapshot, realized_vol)
from agent.decision import Decision, StubDecisionEngine, JevDecisionEngine
from agent.risk import (AccountState, ProposedOrder, RiskEngine, RiskLimits)
from agent.policy import (kelly_fraction, target_size, passes_gate, decide_order,
                          KELLY_CAP)
from agent.loop import step, should_escalate, hold_on_escalation
from agent.paper_broker import PaperBroker
from agent.review import Outcome, brier_score


def _book(bid=99.5, ask=100.5, bsz=2.0, asz=1.0, ts=1.0):
    return OrderBook(ts=ts,
                     bids=(OrderBookLevel(bid, bsz),),
                     asks=(OrderBookLevel(ask, asz),))


# ---- state engine -----------------------------------------------------------

def test_snapshot_basic_math():
    s = compute_snapshot(_book(), PositionState(0.0, 100.0, 100.0), [], now_ts=1.0)
    assert s.mid == 100.0
    assert s.spread == 1.0
    assert s.spread_bps == pytest.approx(100.0)          # 1/100 * 1e4
    # imbalance = (2-1)/(2+1)
    assert s.imbalance == pytest.approx(1/3, abs=1e-6)

def test_snapshot_causality_guard():
    book = _book(ts=5.0)
    with pytest.raises(ValueError):
        compute_snapshot(book, PositionState(0.0, 100.0, 100.0), [], now_ts=4.0)

def test_drawdown_computed():
    s = compute_snapshot(_book(), PositionState(0.0, 85.0, 100.0), [], now_ts=1.0)
    assert s.drawdown == pytest.approx(0.15)

def test_realized_vol_zero_and_positive():
    assert realized_vol([100.0]) == 0.0
    assert realized_vol([100, 101, 99, 102, 98]) > 0.0


# ---- risk layer -------------------------------------------------------------

def _acct(eq=100.0, peak=100.0, sod=100.0, inv=0.0):
    return AccountState(equity=eq, peak_equity=peak, start_of_day_equity=sod, inventory=inv)

def test_kill_switch_blocks_everything():
    r = RiskEngine(RiskLimits(kill_switch_armed=True))
    d = r.check(_acct(), ProposedOrder("buy", 0.1))
    assert not d.allowed and d.risk_state == "halt"

def test_max_drawdown_hard_stop():
    r = RiskEngine(RiskLimits())
    d = r.check(_acct(eq=85.0, peak=100.0), ProposedOrder("buy", 0.1))
    assert not d.allowed and "drawdown" in d.reason

def test_max_daily_loss():
    r = RiskEngine(RiskLimits(max_daily_loss=0.05))
    d = r.check(_acct(eq=94.0, peak=100.0, sod=100.0), ProposedOrder("buy", 0.01))
    assert not d.allowed and "daily loss" in d.reason

def test_max_position_projection():
    r = RiskEngine(RiskLimits(max_position=1.0))
    d = r.check(_acct(inv=0.9), ProposedOrder("buy", 0.2))   # -> 1.1 > 1.0
    assert not d.allowed and "position" in d.reason

def test_risk_allows_within_limits():
    r = RiskEngine(RiskLimits(max_position=1.0))
    d = r.check(_acct(inv=0.0), ProposedOrder("buy", 0.2))
    assert d.allowed and d.risk_state == "safe"


# ---- policy: gate + kelly ---------------------------------------------------

def _dec(direction="long", tq=3, rs="safe", conf=0.9, toxic=False, regime="trending"):
    return Decision(regime=regime, direction=direction, toxic_flow=toxic,
                    setup_quality=tq, risk_state=rs, confidence=conf)

def test_gate_passes_when_all_conditions_met():
    ok, _ = passes_gate(_dec())
    assert ok

@pytest.mark.parametrize("kw", [
    dict(direction="neutral"), dict(tq=1), dict(conf=0.80), dict(rs="near_limit"),
    dict(toxic=True),
])
def test_gate_blocks_each_condition(kw):
    ok, _ = passes_gate(_dec(**kw))
    assert not ok

def test_kelly_cap_enforced():
    # p=0.99 -> full Kelly ~0.98, must be capped at 0.25
    size = target_size(_dec(conf=0.99), bankroll=10_000, price=100.0)
    frac = size * 100.0 / 10_000
    assert frac <= KELLY_CAP + 1e-9

def test_kelly_zero_on_no_edge():
    assert kelly_fraction(0.5, 1.0) == 0.0
    assert kelly_fraction(0.4, 1.0) == 0.0        # negative edge -> clamped to 0

def test_decide_order_blocked_returns_none():
    assert decide_order(_dec(tq=1), 10_000, 100.0) is None

def test_decide_order_side_maps_direction():
    assert decide_order(_dec(direction="long"), 10_000, 100.0).side == "buy"
    assert decide_order(_dec(direction="short"), 10_000, 100.0).side == "sell"


# ---- loop: escalation + risk integration ------------------------------------

def test_should_escalate():
    assert should_escalate(_dec(conf=0.5))
    assert should_escalate(_dec(regime="crisis"))
    assert not should_escalate(_dec(conf=0.9, regime="trending"))

def test_hold_on_escalation_is_neutral():
    d = hold_on_escalation(None, _dec())
    assert d.direction == "neutral" and d.setup_quality == 0

def test_step_escalation_forces_no_trade():
    # low-confidence decision -> escalate -> default hold -> no order placed
    engine = StubDecisionEngine()
    risk = RiskEngine(RiskLimits(max_position=5.0))
    broker = PaperBroker(cash=10_000.0)
    s = compute_snapshot(_book(bsz=1.0, asz=1.0),   # ~zero imbalance -> low conf
                         PositionState(0.0, 10_000.0, 10_000.0), [], now_ts=1.0)
    res = step(s, engine, risk,
               AccountState(10_000, 10_000, 10_000, 0.0), 10_000, broker)
    assert not res.acted
    assert broker.inventory == 0.0


# ---- decision engines -------------------------------------------------------

def test_jev_engine_is_unwired():
    with pytest.raises(NotImplementedError):
        JevDecisionEngine(api_key="x").decide(
            compute_snapshot(_book(), PositionState(0, 100, 100), [], now_ts=1.0))

def test_decision_validation():
    with pytest.raises(ValueError):
        Decision("trending", "long", False, 5, "safe", 0.9)   # tq out of range
    with pytest.raises(ValueError):
        Decision("trending", "long", False, 2, "safe", 1.5)   # conf out of range


# ---- review -----------------------------------------------------------------

def test_brier_score():
    assert brier_score([]) == 0.0
    perfect = [Outcome(1.0, True), Outcome(0.0, False)]
    assert brier_score(perfect) == 0.0
    worst = [Outcome(1.0, False)]
    assert brier_score(worst) == 1.0


# ---- paper broker -----------------------------------------------------------

def test_paper_broker_fills_and_marks():
    b = PaperBroker(cash=1000.0, fee_bps=0.0, slippage_bps=0.0)
    b.market_order("buy", 2.0, 100.0, ts=1.0)
    assert b.inventory == 2.0
    assert b.cash == pytest.approx(800.0)
    assert b.equity(100.0) == pytest.approx(1000.0)
