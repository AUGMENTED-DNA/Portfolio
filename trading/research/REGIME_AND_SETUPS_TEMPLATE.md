# Market research — regime & setups (TEMPLATE, not filled)

> **Why this is a template and not filled research.** The spec requires live,
> dated, primary-sourced metrics and says *"never invent metrics."* This build
> ran in a locked-down sandbox with no access to live market data, so filling in
> numbers would mean fabricating them — exactly what the spec forbids. So this is
> the **structure to fill on a machine with real data access**. Every `<...>` is a
> placeholder for a real, cited, dated figure.

## 1. Regime read (as of `<UTC date/time>`)

| Signal | Value | Source (URL) | As-of |
|---|---|---|---|
| BTC trend (e.g. 50/200d) | `<...>` | `<...>` | `<...>` |
| ETH trend | `<...>` | `<...>` | `<...>` |
| BTC dominance | `<...>` | `<...>` | `<...>` |
| Stablecoin supply / flows | `<...>` | `<...>` | `<...>` |
| Perp funding (majors) | `<...>` | `<...>` | `<...>` |
| Open interest | `<...>` | `<...>` | `<...>` |
| Macro (rates, DXY, risk) | `<...>` | `<...>` | `<...>` |
| Narrative rotation | `<...>` | `<...>` | `<...>` |

**Regime call:** `<trending | mean_reverting | high_vol | crisis>` — because `<...>`.

## 2. Candidate setups (5–10)

For each candidate, fill this block. Keep confirmed catalysts separate from
speculation; label every estimate.

### Setup: `<TICKER>`
- **Thesis (1–2 lines):** `<...>`
- **Why asymmetric / where price disconnects from fundamentals:** `<...>`
- **Token economics:** supply `<...>`, upcoming unlocks `<date, %>`, revenue/fees
  `<...>`, TVL `<...>`, active users `<...>`, holder concentration `<...>`.
- **Does value accrue to the token?** `<yes/no + mechanism>`
- **Confirmed catalysts (dated):** `<...>`
- **Speculative catalysts (labelled):** `<...>`
- **Bear case (argue it hard):** `<...>`
- **Invalidation — what evidence kills the thesis:** `<...>`
- **Sources (URL + as-of date):** `<...>`

## 3. Compiled decision schema per finalist

For each finalist, the live decision reduces to the typed schema in
`agent/decision.py` (`regime`, `direction`, `toxic_flow`, `setup_quality` 0–3,
`risk_state`, `confidence`). Record here the setup-specific thresholds the code
will enforce (entry gate is fixed: setup_quality ≥ 2, confidence > 0.80,
risk_state = safe; sizing = fractional Kelly capped at ¼).

| Finalist | Direction | Key features the engine keys on | Notes |
|---|---|---|---|
| `<...>` | `<...>` | `<...>` | `<...>` |

---

## WHAT COULD I BE WRONG ABOUT?

The spec's required humility section. Answer honestly before trusting any of this.

- **Is the edge organic or incentive-driven?** A yield/points/emissions program
  is not an edge; it disappears when the incentive does. Verify before sizing.
- **Is the catalyst already priced in?** An "upcoming" event everyone knows about
  is usually in the price. The asymmetry has to be in what the market has *wrong*.
- **Does value actually accrue to the token?** Great protocol ≠ great token if
  fees don't reach holders. Many "fundamental" theses fail here.
- **Will it survive costs and slippage?** The paper broker charges fee + slippage
  for a reason. A signal that only works at zero cost is not a strategy.
- **Is any hard limit delegated to the model instead of the code?** It must not
  be. Drawdown, position, daily-loss, and the kill switch live in `agent/risk.py`
  and cannot be overridden by any decision engine. Keep it that way.
- **Is the decision engine real?** As shipped it is `StubDecisionEngine` — a
  no-edge placeholder. There is no validated strategy here yet, and the external
  "Jev" service is unverified and unwired. Do not run this against real money on
  the strength of a stub.
- **Survival over optics.** Prefer a system that stays solvent through a bad week
  over one whose backtest looks profitable.
