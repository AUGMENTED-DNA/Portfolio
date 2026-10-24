"""WAV encoding — float waveform -> PCM16 WAV bytes, using only the stdlib.

Keeps the core dependency-free (no soundfile/numpy needed just to emit a WAV),
so the service and its tests run anywhere. Accepts any iterable of floats in
[-1, 1] (a Python list or a numpy array both work).
"""
from __future__ import annotations

import io
import struct
import wave
from typing import Iterable


def float_to_pcm16_wav(samples: Iterable[float], sample_rate: int) -> bytes:
    """Encode mono float32 samples in [-1, 1] as a 16-bit PCM WAV."""
    pcm = bytearray()
    for s in samples:
        # clamp, then scale to int16
        if s > 1.0:
            s = 1.0
        elif s < -1.0:
            s = -1.0
        pcm += struct.pack("<h", int(round(s * 32767.0)))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sample_rate))
        w.writeframes(bytes(pcm))
    return buf.getvalue()
