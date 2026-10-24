"""Configuration, from environment. Safe offline defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # "mock" (default: offline, no model) or "voxcpm" (real weights, needs GPU)
    backend: str = os.environ.get("VOXCPM_BACKEND", "mock")
    model_id: str = os.environ.get("VOXCPM_MODEL", "openbmb/VoxCPM2")
    device: str = os.environ.get("VOXCPM_DEVICE", "")        # "", "cuda", "mps", "cpu"
    load_denoiser: bool = os.environ.get("VOXCPM_DENOISER", "0") == "1"
    # directory of named reference clips for the OpenAI `voice` parameter
    voices_dir: str = os.environ.get("VOXCPM_VOICES_DIR", "")
    host: str = os.environ.get("VOXCPM_HOST", "127.0.0.1")
    port: int = int(os.environ.get("VOXCPM_PORT", "8080"))


def load_settings() -> Settings:
    return Settings()
