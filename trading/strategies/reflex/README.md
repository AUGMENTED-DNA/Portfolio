# Reflex

The first named agent built on the shared trading framework (`../../agent/`).

**Status:** framework wired into a named, configurable home — **not** a validated
strategy. Reflex currently runs the no-edge `StubDecisionEngine`. It becomes a real
strategy only when the stub is replaced by an engine that clears the acceptance bar
in [`../../DECISION_ENGINE_DESIGN.md`](../../DECISION_ENGINE_DESIGN.md).

## Layout

```
strategies/reflex/
├── __init__.py
├── config.py     # ReflexConfig — all of Reflex's knobs (risk limits, engine, broker)
├── run.py        # paper-mode entrypoint
└── README.md
```

The shared framework in `agent/` stays strategy-agnostic; everything specific to
Reflex lives here. Add another strategy by adding a sibling folder under
`strategies/`.

## Run (paper only)

```bash
cd trading
python -m strategies.reflex.run                  # synthetic feed
python -m strategies.reflex.run --replay books.json
```

## Configuration

Edit `config.py` (`ReflexConfig`): capital, hard risk limits (max drawdown, max
position, max daily loss, kill switch), engine (`stub` | unwired `jev`), broker
(`paper` only — testnet/live are gated by `../../GO_LIVE_CHECKLIST.md`). The hard
limits are enforced in `agent/risk.py` and can never be overridden by the engine.
