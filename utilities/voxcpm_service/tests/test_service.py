"""Tests — run offline against the mock backend (no model, no GPU, no network)."""
import struct
import io
import wave

import pytest

from voxcpm_service.schema import SynthesisRequest
from voxcpm_service.backends import MockBackend, get_backend
from voxcpm_service.wav import float_to_pcm16_wav
from voxcpm_service.voices import resolve_voice
from voxcpm_service.config import Settings
from voxcpm_service.app import create_app


# ---- wav encoding -----------------------------------------------------------

def test_wav_is_valid_48k_pcm16():
    data = float_to_pcm16_wav([0.0, 0.5, -0.5, 1.0, -1.0], 48000)
    with wave.open(io.BytesIO(data), "rb") as w:
        assert w.getframerate() == 48000
        assert w.getnchannels() == 1
        assert w.getsampwidth() == 2
        assert w.getnframes() == 5

def test_wav_clamps_out_of_range():
    data = float_to_pcm16_wav([2.0, -2.0], 48000)
    with wave.open(io.BytesIO(data), "rb") as w:
        frames = w.readframes(2)
    a, b = struct.unpack("<hh", frames)
    assert a == 32767 and b == -32767


# ---- schema -----------------------------------------------------------------

def test_schema_mode_detection():
    assert SynthesisRequest(text="hi").mode == "standard_tts"
    assert SynthesisRequest(text="hi", reference_wav_path="r.wav").mode == "controllable_clone"
    assert SynthesisRequest(text="hi", prompt_wav_path="p.wav",
                            prompt_text="t").mode == "ultimate_clone"

def test_schema_rejects_empty_text():
    with pytest.raises(ValueError):
        SynthesisRequest(text="   ").validate()

def test_schema_prompt_pairing_rule():
    with pytest.raises(ValueError):
        SynthesisRequest(text="hi", prompt_wav_path="p.wav").validate()   # missing prompt_text
    with pytest.raises(ValueError):
        SynthesisRequest(text="hi", prompt_text="t").validate()           # missing prompt_wav_path


# ---- mock backend -----------------------------------------------------------

def test_mock_backend_outputs_48k_and_varies_by_text():
    b = MockBackend()
    s1, sr = b.synthesize(SynthesisRequest(text="short"))
    s2, _ = b.synthesize(SynthesisRequest(text="a much longer piece of text here"))
    assert sr == 48000
    assert len(s2) > len(s1) > 0

def test_get_backend_unknown():
    with pytest.raises(ValueError):
        get_backend("nope")


# ---- voices -----------------------------------------------------------------

def test_resolve_voice_none_when_no_dir():
    assert resolve_voice("alloy", "") is None
    assert resolve_voice(None, "/tmp") is None

def test_resolve_voice_finds_file(tmp_path):
    (tmp_path / "alloy.wav").write_bytes(b"RIFF")
    assert resolve_voice("alloy", str(tmp_path)) == str(tmp_path / "alloy.wav")
    assert resolve_voice("missing", str(tmp_path)) is None

def test_resolve_voice_blocks_path_escape(tmp_path):
    # a traversal attempt is reduced to a basename and won't escape the dir
    assert resolve_voice("../../etc/passwd", str(tmp_path)) is None


# ---- API (mock backend) -----------------------------------------------------

def _client():
    from fastapi.testclient import TestClient
    return TestClient(create_app(Settings(backend="mock")))

def test_health_and_models():
    c = _client()
    assert c.get("/health").json()["backend"] == "mock"
    assert c.get("/v1/models").json()["data"][0]["id"] == "openbmb/VoxCPM2"

def test_speech_returns_wav():
    c = _client()
    r = c.post("/v1/audio/speech", json={"input": "Rollback initiated.", "voice": "alloy"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    assert r.headers["x-sample-rate"] == "48000"
    with wave.open(io.BytesIO(r.content), "rb") as w:
        assert w.getframerate() == 48000

def test_speech_rejects_unsupported_format():
    c = _client()
    r = c.post("/v1/audio/speech", json={"input": "hi", "response_format": "mp3"})
    assert r.status_code == 400

def test_clone_prompt_pairing_error():
    c = _client()
    r = c.post("/v1/audio/clone", json={"input": "hi", "prompt_wav_path": "p.wav"})
    assert r.status_code == 400   # prompt_text missing
