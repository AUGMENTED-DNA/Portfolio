"""Tests for the data-feed / broker adapters and the session runner."""
import json

import pytest

from agent.data_feed import SyntheticFeed, ReplayFeed
from agent.broker import TestnetBroker, PaperBroker, Broker
from agent.decision import StubDecisionEngine
from agent.risk import RiskEngine, RiskLimits
from agent.runner import run_session


def test_synthetic_feed_is_causal_and_sized():
    books = list(SyntheticFeed(n=50).stream())
    assert len(books) == 50
    ts = [b.ts for b in books]
    assert ts == sorted(ts)                      # non-decreasing timestamps
    assert all(b.bids and b.asks for b in books)

def test_synthetic_feed_deterministic():
    a = [b.ts for b in SyntheticFeed(n=10, seed=1).stream()]
    b = [x.ts for x in SyntheticFeed(n=10, seed=1).stream()]
    assert a == b

def test_replay_feed_reads_rows(tmp_path):
    rows = [
        {"ts": 1.0, "bids": [[99.0, 2.0]], "asks": [[101.0, 1.0]]},
        {"ts": 2.0, "bids": [[99.5, 1.0]], "asks": [[100.5, 1.0]]},
    ]
    p = tmp_path / "books.json"
    p.write_text(json.dumps(rows))
    books = list(ReplayFeed(p).stream())
    assert len(books) == 2
    assert books[0].bids[0].price == 99.0

def test_replay_feed_rejects_backwards_time(tmp_path):
    rows = [
        {"ts": 5.0, "bids": [[99.0, 1.0]], "asks": [[101.0, 1.0]]},
        {"ts": 4.0, "bids": [[99.0, 1.0]], "asks": [[101.0, 1.0]]},   # goes back
    ]
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(rows))
    with pytest.raises(ValueError):
        list(ReplayFeed(p).stream())

def test_testnet_broker_is_unwired():
    b = TestnetBroker(endpoint="https://example.invalid", api_key="x")
    with pytest.raises(NotImplementedError):
        b.market_order("buy", 1.0, 100.0, 1.0)

def test_paper_broker_satisfies_broker_protocol():
    # structural check: PaperBroker has the Broker surface
    b: Broker = PaperBroker(cash=100.0)
    assert hasattr(b, "market_order") and hasattr(b, "equity")

def test_run_session_end_to_end_paper():
    feed = SyntheticFeed(n=120)
    engine = StubDecisionEngine()
    risk = RiskEngine(RiskLimits(max_position=5.0))
    broker = PaperBroker(cash=10_000.0)
    res = run_session(feed, engine, risk, broker, start_equity=10_000.0, keep_log=True)
    assert res.blocks == 120
    assert len(res.log) == 120
    assert res.trades >= 0
    # equity is finite and computed
    assert res.final_equity > 0
