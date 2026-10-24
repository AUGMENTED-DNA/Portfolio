"""Request schema shared by the API layer and the backends.

A single ``SynthesisRequest`` captures all four VoxCPM modes from the spec:
standard TTS, controllable cloning (reference_wav_path), ultimate cloning
(prompt_wav_path + prompt_text [+ reference]), and voice design (style tokens in
the text itself). Field names and the pairing rule mirror the REAL VoxCPM
`generate()` signature verified against the package.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class SynthesisRequest:
    text: str
    # cloning inputs (optional)
    reference_wav_path: Optional[str] = None     # controllable cloning
    prompt_wav_path: Optional[str] = None         # ultimate cloning (with prompt_text)
    prompt_text: Optional[str] = None
    # generation controls (match VoxCPM.generate defaults)
    cfg_value: float = 2.0
    inference_timesteps: int = 10
    normalize: bool = False
    denoise: bool = False
    seed: Optional[int] = None

    def validate(self) -> None:
        if not isinstance(self.text, str) or not self.text.strip():
            raise ValueError("text must be a non-empty string")
        # VoxCPM's own rule: prompt_wav_path and prompt_text are both-or-neither.
        if (self.prompt_wav_path is None) != (self.prompt_text is None):
            raise ValueError(
                "prompt_wav_path and prompt_text must both be provided or both omitted")

    @property
    def mode(self) -> str:
        if self.prompt_wav_path is not None:
            return "ultimate_clone"
        if self.reference_wav_path is not None:
            return "controllable_clone"
        return "standard_tts"
