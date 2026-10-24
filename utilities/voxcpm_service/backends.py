"""TTS backends.

The service talks to a backend only through the ``TTSBackend`` protocol, so it
can't tell the mock from the real model. Two are provided:

* ``MockBackend`` — deterministic, offline, no model. Produces a short tone so the
  whole service (API, WAV encoding, voice routing) runs and is testable without a
  GPU or model weights. It is NOT speech; it is plumbing.
* ``VoxCPMBackend`` — the real OpenBMB VoxCPM2 model, called through the API
  verified against the package. Lazily imports ``voxcpm`` and loads the model on
  first use; needs ``pip install voxcpm`` + weights + a capable device. It is not
  importable/usable in an environment without those, by design.
"""
from __future__ import annotations

import math
from typing import List, Protocol, Tuple

from .schema import SynthesisRequest

SAMPLE_RATE_48K = 48000


class TTSBackend(Protocol):
    name: str
    def sample_rate(self) -> int: ...
    def synthesize(self, req: SynthesisRequest) -> Tuple[list, int]:
        """Return (mono float samples in [-1,1], sample_rate)."""
        ...


class MockBackend:
    """Offline placeholder: a short, deterministic tone. NOT real speech."""

    name = "mock"

    def __init__(self, sample_rate: int = SAMPLE_RATE_48K):
        self._sr = sample_rate

    def sample_rate(self) -> int:
        return self._sr

    def synthesize(self, req: SynthesisRequest) -> Tuple[List[float], int]:
        req.validate()
        # Length scales with text so different inputs yield different output,
        # capped so tests stay fast. Pitch nudged by mode, purely cosmetic.
        secs = min(2.0, 0.25 + 0.03 * len(req.text))
        n = int(self._sr * secs)
        base = {"standard_tts": 220.0, "controllable_clone": 262.0,
                "ultimate_clone": 330.0}[req.mode]
        samples = [0.2 * math.sin(2 * math.pi * base * (i / self._sr)) for i in range(n)]
        return samples, self._sr


class VoxCPMBackend:
    """Real VoxCPM2. Lazy, heavy, GPU-oriented. Verified against the package API:
        from voxcpm import VoxCPM
        model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
        wav = model.generate(text=..., reference_wav_path=..., prompt_wav_path=...,
                             prompt_text=..., cfg_value=..., inference_timesteps=...,
                             normalize=..., denoise=..., seed=...)   # -> np.float32[]
        sr  = model.tts_model.sample_rate
    """

    name = "voxcpm"

    def __init__(self, model_id: str = "openbmb/VoxCPM2", *,
                 device: str = "", load_denoiser: bool = False):
        self.model_id = model_id
        self.device = device
        self.load_denoiser = load_denoiser
        self._model = None

    def _load(self):
        if self._model is not None:
            return self._model
        try:
            from voxcpm import VoxCPM  # heavy; imported only when actually used
        except Exception as e:  # pragma: no cover - env without the package
            raise RuntimeError(
                "The 'voxcpm' package is not installed. Install it on a machine "
                "with a suitable GPU: `pip install voxcpm` (and torch/torchaudio). "
                f"Underlying import error: {e}")
        kwargs = {"load_denoiser": self.load_denoiser}
        if self.device:
            kwargs["device"] = self.device
        self._model = VoxCPM.from_pretrained(self.model_id, **kwargs)
        return self._model

    def sample_rate(self) -> int:
        model = self._load()
        return int(model.tts_model.sample_rate)

    def synthesize(self, req: SynthesisRequest) -> Tuple[list, int]:
        req.validate()
        model = self._load()
        wav = model.generate(
            text=req.text,
            reference_wav_path=req.reference_wav_path,
            prompt_wav_path=req.prompt_wav_path,
            prompt_text=req.prompt_text,
            cfg_value=req.cfg_value,
            inference_timesteps=req.inference_timesteps,
            normalize=req.normalize,
            denoise=req.denoise,
            seed=req.seed,
        )
        return wav, int(model.tts_model.sample_rate)


def get_backend(name: str, settings=None) -> TTSBackend:
    if name == "mock":
        return MockBackend()
    if name == "voxcpm":
        if settings is not None:
            return VoxCPMBackend(settings.model_id, device=settings.device,
                                 load_denoiser=settings.load_denoiser)
        return VoxCPMBackend()
    raise ValueError(f"unknown backend {name!r} (use 'mock' or 'voxcpm')")
