"""The live loop — PAPER MODE ONLY.

Per block: build the snapshot (code), get a Decision (engine), maybe escalate,
run the gate + sizing (code), pass the intent through the hard risk layer (code),
and only then send it to the paper broker. Cheap fast path by default; the
escalation hook is where heavy reasoning ("the brain") would be invoked when
confidence is low or the regime flips to crisis.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from .decision import Decision, DecisionEngine
from .policy import decide_order
from .risk import AccountState, ProposedOrder, RiskEngine
from .state_engine import StateSnapshot

# Escalation thresholds (spec): low confidence or crisis -> re-read by the brain.
ESCALATE_CONFIDENCE = 0.60

# A brain hook takes the low-confidence/crisis snapshot+decision and returns a
# possibly-revised Decision (or the same one). Default: force a HOLD by returning
# a neutral decision — safe when no deep reviewer is wired in.
BrainHook = Callable[[StateSnapshot, Decision], Decision]


def hold_on_escalation(snapshot: StateSnapshot, decision: Decision) -> Decision:
    """Default brain hook: refuse to act. Neutral + zero setup quality => no trade."""
    return Decision(
        regime=decision.regime,
        direction="neutral",
        toxic_flow=decision.toxic_flow,
        setup_quality=0,
        risk_state=decision.risk_state,
        confidence=decision.confidence,
    )


@dataclass
class StepResult:
    ts: float
    decision: Decision
    escalated: bool
    acted: bool
    detail: str


def should_escalate(d: Decision) -> bool:
    return d.confidence < ESCALATE_CONFIDENCE or d.regime == "crisis"


def step(
    snapshot: StateSnapshot,
    engine: DecisionEngine,
    risk: RiskEngine,
    account: AccountState,
    bankroll: float,
    broker,                       # PaperBroker (duck-typed)
    *,
    brain_hook: Optional[BrainHook] = None,
) -> StepResult:
    """One block of the loop, paper mode. Returns what happened."""
    decision = engine.decide(snapshot)

    escalated = should_escalate(decision)
    if escalated:
        hook = brain_hook or hold_on_escalation
        decision = hook(snapshot, decision)

    intent = decide_order(decision, bankroll=bankroll, price=snapshot.mid)
    if intent is None:
        return StepResult(snapshot.ts, decision, escalated, False, "no trade (gate/size)")

    rd = risk.check(account, ProposedOrder(side=intent.side, size=intent.size))
    if not rd.allowed:
        return StepResult(snapshot.ts, decision, escalated, False, f"risk blocked: {rd.reason}")

    broker.market_order(intent.side, intent.size, snapshot.mid, snapshot.ts)
    return StepResult(snapshot.ts, decision, escalated, True,
                      f"{intent.side} {intent.size:.6f} @ {snapshot.mid} ({intent.reason})")
