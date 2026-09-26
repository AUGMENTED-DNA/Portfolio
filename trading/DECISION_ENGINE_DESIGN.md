# Decision engine — design (how to replace the stub with something real)

> Design only. No engine is built here, and no metrics are invented. This is the
> plan for turning `StubDecisionEngine` (a no-edge placeholder) into a validated
> engine that is *allowed* to size real risk. The bar to clear is deliberately
> high: **a system that survives beats one that looks profitable.**

## 0. The contract it must honour

A real engine is still just a `DecisionEngine` (`agent/decision.py`): it takes one
`StateSnapshot` and returns a typed `Decision` (`regime`, `direction`,
`toxic_flow`, `setup_quality` 0–3, `risk_state`, `confidence`). It **only judges**.
It never sizes, never places orders, and **cannot override `agent/risk.py`**. The
gate (setup_quality ≥ 2, confidence > 0.80, risk safe) and quarter-Kelly sizing
stay in code. Nothing in this design moves a hard limit into the model.

Because sizing is fractional Kelly on `confidence`, **`confidence` must be a
calibrated probability, not a vibe.** A miscalibrated, overconfident engine is
worse than a coin flip here: Kelly will size up exactly when it shouldn't. That is
the single most important property below.

## 1. What "edge" has to mean

Before any feature work, three filters (from the spec's final check):

- **Organic, not incentive-driven.** Yield/points/emissions are not an edge; they
  vanish with the incentive. If the return depends on a program, model the program.
- **Not already priced in.** The asymmetry must be in what the market has *wrong*,
  not in a catalyst everyone already knows.
- **Survives costs and slippage.** Evaluated net of the paper broker's fee +
  slippage (and worse in stress). A signal that only works at zero cost is not one.

## 2. Feature families

Split by what this repo can compute *now* vs. what needs external data access
(labelled — none of it is wired or fabricated here).

**Available now (from `state_engine.py`, causal by construction):**
- order-book imbalance (multi-depth), spread and spread dynamics
- realized volatility (rolling), and its term structure
- inventory / drawdown state (for regime + risk_state, not for direction)
- short-horizon mid returns / autocorrelation (mean-revert vs. trend proxy)

**Needs a data feed (labelled TODO, not present):**
- trade prints / signed order flow, VPIN-style toxicity (a real `toxic_flow`)
- perp funding, open interest, basis
- on-chain: unlocks/vesting cliffs, exchange flows, active addresses, fees/revenue
- cross-asset / macro regime (BTC dominance, DXY, rates)

**Causality is non-negotiable.** Every feature at time *t* uses only data stamped
≤ *t*. The state engine already enforces this for the book; any new feed must be
timestamped and joined the same way, or it will leak the future and backtest like
magic.

## 3. Confidence calibration (the load-bearing part)

1. The raw model emits a score; **map it to a calibrated probability** with a
   method fit on a *held-out* set — isotonic regression or Platt scaling — never
   on the training data.
2. Measure calibration with the tools already here: `agent/review.py` gives Brier
   score and a per-bucket reliability report (stated vs. realized hit-rate).
3. **Acceptance:** stated confidence must track realized hit-rate within a set
   tolerance per bucket, and Brier must beat the 0.25 "always 0.5" baseline
   out-of-sample. If it can't, the engine is not allowed to size — full stop.
4. Re-calibrate on a schedule (the nightly review), but **never auto-ship** a new
   calibration or schema; that stays a human-approved gate.

## 4. Validation protocol (before it can replace the stub)

- **Walk-forward, out-of-sample only.** Train on a window, test on the next
  untouched window, roll forward. No peeking.
- **Purge + embargo** around each split so features/labels can't straddle the
  boundary (lookahead leakage is the #1 way a fake edge appears).
- **Costs in the loop.** Evaluate net of fee + slippage, then stress slippage
  upward and confirm the edge doesn't evaporate.
- **Across regimes.** Must hold in trending, mean-reverting, high-vol, and be
  *safe* (not necessarily profitable) in crisis — crisis should escalate/flatten,
  not lever up.
- **Multiple-testing discipline.** Every extra feature/threshold tried inflates
  the odds of a fluke. Track how many variants were tested; discount results
  accordingly (deflated performance). One good-looking backtest out of fifty is
  noise.
- **Stability.** Small parameter changes shouldn't flip the result. A knife-edge
  optimum is overfit.

## 5. Acceptance bar (concrete gates, all owned by code/review — fill the numbers)

An engine may replace the stub only when, **out-of-sample and net of costs**, it:
- shows positive expectancy across `<N>` non-overlapping windows and `<M>`
  regimes (set `N`, `M` before looking — no moving the goalposts);
- has Brier `< <target>` and calibration within `<tolerance>` per bucket;
- keeps simulated max drawdown within the `agent/risk.py` limit (15%) *without*
  relying on the kill switch to save it;
- survives a slippage stress of `<x>`× the modelled cost;
- degrades gracefully in crisis (escalates/flattens, no size-up).

Thresholds are parameters to set deliberately, in code/config — not vibes, and not
delegated to the model.

## 6. Rollout ladder (each rung is a human-approved gate)

`backtest (offline)` → `paper live-data (read-only feed)` → `exchange testnet
(fake funds)` → `micro-size live` → `scale`. You do not skip rungs, and each rung
must reproduce the previous rung's calibration before advancing. Real money is the
last rung, gated separately (see a go-live checklist).

## 7. Where a model call could sit (latency + cost)

The reflex path must stay cheap and fast. If an external judgement model is used,
it sits inside `decide()` behind the `DecisionEngine` interface, with a strict
latency budget and a deterministic fallback if it's slow or unavailable — the loop
must never block on it. The heavy reasoning ("the brain") stays on the escalation
path (`loop.py`), invoked only when confidence is low or the regime is crisis.
(The specific external services named in the source spec remain unverified and are
out of scope until independently vetted.)

## 8. Failure modes to design against

- **Overfitting / lookahead / survivorship** — killed by walk-forward, purging,
  and honest universe construction.
- **Miscalibrated confidence → Kelly blowup** — killed by the calibration gate.
- **Regime shift** — the edge that worked last quarter is gone; the review must
  detect decay (rising Brier / falling hit-rate) and pull sizing back.
- **Incentive-driven mirage** — re-check §1 every time a new "edge" appears.
- **Silent data outage** — a stale feed must degrade to neutral, never to a
  confident stale call.

## WHAT COULD I BE WRONG ABOUT?

- Most apparent edges are overfit; assume yours is until walk-forward says
  otherwise, and even then size small.
- A great backtest with real costs can still lose live to latency, partial fills,
  and adverse selection the sim didn't model.
- Calibration measured in calm regimes can break in the one that matters.
- The safest correct outcome for a lot of this design is **"no trade"** — an
  engine that mostly declines and occasionally acts with a real, calibrated edge
  beats one that always has an opinion.
