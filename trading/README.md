# Trading Agent (paper / simulation scaffold)

A structured scaffold built from [`BUILD_INSTRUCTIONS.md`](./BUILD_INSTRUCTIONS.md).
It implements the parts of that spec that are safe to build and verify locally,
and **deliberately stops short of anything that moves real money or depends on
unverified third parties.** Read this before running anything.

## Safety posture — read this first

This code is **paper-trading / simulation only.** As shipped it:

- places **no real orders** and connects to **no exchange**;
- holds **no API keys** and makes **no outbound network calls**;
- does **not** auto-execute anything — `agent/loop.py` runs against a simulated
  broker (`agent/paper_broker.py`).

Turning any of this into live trading is an explicit operator decision, not a
default, and is intentionally not wired here.

## What was built vs. what was intentionally NOT built

**Built (deterministic, tested, offline):**

| Spec section | File | Notes |
|---|---|---|
| `<state_engine>` | `agent/state_engine.py` | mid, spread, imbalance, realized vol, inventory, drawdown — computed in code, causal timestamps, compact snapshot |
| `<jev_schema>` | `agent/decision.py` | the typed decision schema (regime / direction / toxic_flow / setup_quality / risk_state / confidence) + a pluggable `DecisionEngine` interface |
| `<risk_layer>` | `agent/risk.py` | hard deterministic limits (max drawdown 15%, max position, max daily loss, armed kill switch) the decision engine can never override |
| gate + sizing | `agent/policy.py` | fire only when setup_quality ≥ 2, confidence > 0.80, risk_state safe; fractional Kelly capped at ¼ Kelly |
| live loop | `agent/loop.py` | **paper mode**, risk checks before every order, escalation hook when confidence < 0.60 or regime = crisis |
| backtest | `agent/backtest.py` | replay the policy over historical candles |
| self-review | `agent/review.py` | Brier-score calibration over a session log |

**NOT built (needs your explicit go-ahead, and independent verification):**

- **Live trading / real-money execution.** No exchange adapter is included.
- **The external services in the spec** — "AgenKit" (`agenkit.xyz`), "Jev"
  (`console.typesafe.ai`), "typesafe.ai". I could not verify these exist or are
  safe, and this sandbox's network is locked down, so nothing here signs up for,
  installs, or calls them. `JevDecisionEngine` in `agent/decision.py` is an
  **unwired placeholder** that refuses to run until a real, verified adapter is
  supplied. The default engine is `StubDecisionEngine`, a local, deterministic
  placeholder with **no trading edge** — it exists only to exercise the plumbing.
- **Market research with live metrics.** The spec says "never invent metrics,"
  and I cannot reach live sources from here, so `research/` contains a
  **template to fill with real data**, not fabricated numbers.

## A couple of honest corrections to the spec

- **Model version.** The spec says "Opus 5.5." This session runs as configured
  (Opus-class); there is no "Opus 5.5" I can confirm. Nothing here depends on a
  specific marketing version.
- **The decision engine is a placeholder, not an edge.** `StubDecisionEngine`
  makes toy decisions from order-book features. It is not a strategy and must not
  be treated as one. A real decision engine — whether "Jev" or anything else —
  must be supplied and validated before this is more than plumbing.

## Adapters (data feed & broker)

The loop talks to the outside world only through two interfaces, so it can't tell
where data comes from or where orders go:

- **`agent/data_feed.py`** — `DataFeed` protocol. `SyntheticFeed` (deterministic,
  for tests) and `ReplayFeed` (replays recorded books from a local JSON file,
  enforcing non-decreasing timestamps). A live read-only feed would implement the
  same protocol.
- **`agent/broker.py`** — `Broker` protocol. `PaperBroker` (simulated fills) is
  the default. `TestnetBroker` is an **unwired placeholder**: a testnet moves only
  fake funds but still needs an endpoint + credentials, so it refuses to run until
  a verified adapter is supplied. **There is no mainnet/real-money broker here.**
- **`agent/runner.py`** — `run_session()` drives any feed through the loop into any
  broker, keeping the causal bookkeeping honest.

## Run it (offline, paper)

```bash
cd trading
python -m agent.backtest                    # synthetic feed through the policy
python -m agent.backtest --replay books.json # replay recorded order books (JSON)
python -m pytest tests -q                    # run the unit tests (33)
```

Recorded-book JSON format (one row per block):
```json
[{"ts": 1.0, "bids": [[99.0, 2.0]], "asks": [[101.0, 1.0]]}]
```

The backtest also prints the **nightly review**: it forward-grades each block's
engine judgement and reports Brier score + hit-rate (`agent/review.py`). This is
evaluation-only — it never feeds back into live decisions and never auto-ships a
schema change (that stays human-approved). It's the spec's self-improvement loop,
running offline.

## The 6-phase plan (from the spec)

1. **Spec** — `BUILD_INSTRUCTIONS.md` (done).
2. **Architecture** — the two-layer split (deterministic code owns thresholds,
   sizing, side effects; the decision engine only judges); see `agent/`.
3. **Plan** — file layout above.
4. **Test-first build** — deterministic core + tests (done for the safe layers).
5. **Review** — `agent/review.py` (Brier calibration).
6. **Ship** — **gated on operator approval**; live execution is not included.

See the bottom of this folder's work for **"WHAT COULD I BE WRONG ABOUT?"** — the
spec's required humility section — in `research/REGIME_AND_SETUPS_TEMPLATE.md`.
