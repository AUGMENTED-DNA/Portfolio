"""Voice library — maps a named voice to a reference audio clip.

OpenAI's API takes a `voice` string (e.g. "alloy"). Here a voice name resolves to
a reference .wav in the voices directory (``<name>.wav``), which the cloning
backend uses as ``reference_wav_path``. An unknown voice (or no voices dir) falls
back to plain TTS with no reference.

CONSENT: only add a reference clip for a voice you are authorised to use. Cloning
a real person's voice without their permission is a misuse of this tool.
"""
from __future__ import annotations

import os
from typing import Optional


def resolve_voice(voice: Optional[str], voices_dir: str) -> Optional[str]:
    """Return a reference wav path for ``voice``, or None for plain TTS."""
    if not voice or not voices_dir:
        return None
    # keep it to a bare filename; never let the request escape the voices dir
    safe = os.path.basename(str(voice))
    path = os.path.join(voices_dir, f"{safe}.wav")
    return path if os.path.isfile(path) else None
