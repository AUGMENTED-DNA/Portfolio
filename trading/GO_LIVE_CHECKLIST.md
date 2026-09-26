# Go-live safety checklist

> Gate, not a formality. Real money is the **last** rung of the ladder and every
> box below must be checked, by a human, before it. If any box is unchecked, you
> are not live — you are gambling. This scaffold ships nothing here to mainnet;
> this file is the discipline that must sit between it and real funds.

## Rollout ladder — advance one rung at a time, never skip

- [ ] **1. Backtest (offline)** — reproducible, costs modelled, walk-forward, out-of-sample. Acceptance bar in `DECISION_ENGINE_DESIGN.md` §5 met.
- [ ] **2. Paper on live read-only data** — same engine, real market feed, no orders. Calibration (Brier/hit-rate) reproduces the backtest within tolerance for `<duration>`.
- [ ] **3. Exchange testnet (fake funds)** — real order plumbing end to end. Fills, partial fills, rejects, and reconnects all handled. No mainnet endpoint reachable from this config.
- [ ] **4. Micro-size live** — smallest viable real size, tight caps, close supervision, for `<duration>`. Live calibration still tracks.
- [ ] **5. Scale** — only after 4 holds across `<N>` sessions and `<M>` regimes.

> Each rung must reproduce the previous rung's calibration before advancing. A rung
> that degrades is a stop, not a warning.

## Prerequisites (before rung 4)

- [ ] Decision engine passed the acceptance bar **out-of-sample, net of costs** (not the stub).
- [ ] `confidence` is **calibrated** (Brier beats 0.25 baseline; per-bucket reliability within tolerance).
- [ ] Every hard limit lives in `agent/risk.py`, **not** in the model — verified by reading the code, not by trusting it.

## Risk limits — set and verified in code

- [ ] `max_drawdown` set (default 15%) and **tested to actually halt** (fault-inject a drawdown, confirm orders blocked).
- [ ] `max_position` set for the real instrument and confirmed against the projection check.
- [ ] `max_daily_loss` set against real start-of-day equity.
- [ ] Sizing capped at quarter Kelly; confirm no path sizes above it.
- [ ] Escalation thresholds (confidence < 0.60, regime = crisis) route to a real reviewer or a flatten, not a silent hold that hides a problem.

## Kill switch — armed and drilled

- [ ] Kill switch is checked **before every order** (it is, in `risk.py` — confirm it's wired on the live path too).
- [ ] Manual kill is reachable in **one action** by the operator, out-of-band from the agent.
- [ ] **Drill it**: arm it mid-session on testnet, confirm all new orders are refused and open exposure is handled per plan.
- [ ] Decide and document: on kill, does the system **flatten** or **hold** existing positions? (Default to the safer choice for your instrument.)

## Keys & secrets

- [ ] Real keys live only in `.env` / a secrets manager — **never** committed (`.gitignore` covers `.env`, `*.key`, `*.pem`, `secrets/`, `keys/`).
- [ ] API keys are **least-privilege**: trade-only, **withdrawal disabled**, IP-allowlisted where the venue supports it.
- [ ] Separate keys per rung (testnet ≠ live); rotating one never exposes the other.
- [ ] No key, endpoint, or secret is ever printed to logs.

## Monitoring & alerting

- [ ] Live equity, drawdown, inventory, and daily P&L are observable in real time.
- [ ] Alerts fire on: limit breach, kill-switch trip, feed staleness/outage, reject-rate spike, calibration decay (rising Brier / falling hit-rate).
- [ ] A **stale or missing feed degrades to neutral / no-trade**, never to a confident stale call — verified.
- [ ] Heartbeat: if the agent stops running, someone is notified.

## Reconciliation & accounting

- [ ] Local position/cash is reconciled against the venue's truth every `<interval>`; a mismatch halts trading.
- [ ] Every fill is logged with venue order id, price, size, fee, timestamp.
- [ ] Fees and funding are accounted in P&L, not ignored.

## Operational runbook (write it before you need it)

- [ ] What to do on: exchange outage, partial fill stuck, reconnect storm, unexpected inventory, calibration collapse.
- [ ] Who is on call, and how they reach the kill switch.
- [ ] How to safely stop and restart without double-counting or duplicate orders (idempotent restart).

## External dependencies

- [ ] Any third-party service (data, execution, decision) has been **independently verified** — that it exists, what it does with your data, its uptime/latency, and its failure behaviour. (The services named in the source spec — AgenKit / Jev / typesafe.ai — are **not** verified in this build.)
- [ ] The live loop **never blocks** on an external call; a slow/absent dependency falls back to a deterministic safe path.

## Final gate

- [ ] Every box above is checked, by a named human, with a date.
- [ ] Capital at risk is money you can afford to lose entirely.
- [ ] You have decided, in advance, the loss level at which you turn the whole thing off.

> If you cannot check the last three, do not go live. Prefer a system that survives
> over one that looks profitable.
