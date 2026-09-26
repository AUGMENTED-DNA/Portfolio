"""Reflex configuration — all the knobs for this agent in one place.

This is the ONLY place Reflex's risk limits, engine choice, and sizing live. The
shared framework reads these; it has no Reflex-specific code. Change Reflex by
editing this file, not the framework.
"""
from __future__ import annotations

from dataclasses import dataclass

from agent.decision import DecisionEngine, JevDecisionEngine, StubDecisionEngine
from agent.paper_broker import PaperBroker
from agent.risk import RiskEngine, RiskLimits


@dataclass(frozen=True)
class ReflexConfig:
    name: str = "reflex"
    # capital / accounting
    start_equity: float = 10_000.0
    # hard risk limits (owned here, enforced in agent/risk.py — never by the model)
    max_drawdown: float = 0.15
    max_position: float = 5.0
    max_daily_loss: float = 0.05
    kill_switch_armed: bool = False
    # decision engine: "stub" (no edge, default) | "jev" (unwired placeholder)
    engine: str = "stub"
    # broker: "paper" is the only wired venue; testnet/live are gated (see GO_LIVE)
    broker: str = "paper"

    def build_engine(self) -> DecisionEngine:
        if self.engine == "stub":
            return StubDecisionEngine()
        if self.engine == "jev":
            # Unwired: .decide() will raise until a verified adapter is supplied.
            return JevDecisionEngine()
        raise ValueError(f"unknown engine {self.engine!r}")

    def build_risk(self) -> RiskEngine:
        return RiskEngine(RiskLimits(
            max_drawdown=self.max_drawdown,
            max_position=self.max_position,
            max_daily_loss=self.max_daily_loss,
            kill_switch_armed=self.kill_switch_armed,
        ))

    def build_broker(self):
        if self.broker == "paper":
            return PaperBroker(cash=self.start_equity)
        # testnet/live are intentionally not constructible from config alone.
        raise ValueError(
            f"broker {self.broker!r} is not wired. Only 'paper' is available; a "
            "testnet/live venue requires the gated go-live process (see "
            "GO_LIVE_CHECKLIST.md).")


def build_components(config: ReflexConfig | None = None):
    """Assemble (engine, risk, broker) for a session from a ReflexConfig."""
    cfg = config or ReflexConfig()
    return cfg, cfg.build_engine(), cfg.build_risk(), cfg.build_broker()
