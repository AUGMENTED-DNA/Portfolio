"""Reflex — the first named agent built on the trading framework.

Reflex currently runs the no-edge StubDecisionEngine: it is the framework wired
into a named, configurable home, NOT a validated strategy. Replacing the stub
with a real engine (per ../../DECISION_ENGINE_DESIGN.md) is what would make Reflex
an actual strategy.
"""
from .config import ReflexConfig, build_components

__all__ = ["ReflexConfig", "build_components"]
