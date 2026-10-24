"""OpenAI-compatible speech API over a pluggable VoxCPM backend.

Endpoints:
  GET  /health            -> {status, backend, sample_rate}
  GET  /v1/models         -> OpenAI-style model list
  POST /v1/audio/speech   -> OpenAI-compatible TTS; returns audio bytes
  POST /v1/audio/clone    -> VoxCPM-native cloning (reference/prompt inputs)

The OpenAI `voice` field resolves to a reference clip via the voice library, so
this is a drop-in for an OpenAI/ElevenLabs TTS base URL (per the spec's §6). Extra
VoxCPM controls (cfg_value, inference_timesteps, seed, prompt_*) are accepted as
optional fields alongside the standard ones.
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field

from .backends import get_backend
from .config import load_settings
from .schema import SynthesisRequest
from .voices import resolve_voice
from .wav import float_to_pcm16_wav


class SpeechRequest(BaseModel):
    # OpenAI fields
    model: str = "openbmb/VoxCPM2"
    input: str = Field(..., description="text to synthesize")
    voice: Optional[str] = None
    response_format: str = "wav"       # only wav is emitted by the core encoder
    # VoxCPM extras (optional)
    reference_wav_path: Optional[str] = None
    prompt_wav_path: Optional[str] = None
    prompt_text: Optional[str] = None
    cfg_value: float = 2.0
    inference_timesteps: int = 10
    normalize: bool = False
    denoise: bool = False
    seed: Optional[int] = None


def create_app(settings=None) -> FastAPI:
    settings = settings or load_settings()
    backend = get_backend(settings.backend, settings)
    app = FastAPI(title="VoxCPM speech service", version="0.1.0")

    def _synthesize(req: SynthesisRequest) -> Response:
        try:
            req.validate()
            samples, sr = backend.synthesize(req)
        except (ValueError, FileNotFoundError) as e:
            raise HTTPException(status_code=400, detail=str(e))
        except RuntimeError as e:            # backend not installed / model load failed
            raise HTTPException(status_code=503, detail=str(e))
        audio = float_to_pcm16_wav(samples, sr)
        return Response(content=audio, media_type="audio/wav",
                        headers={"X-Backend": backend.name, "X-Sample-Rate": str(sr)})

    @app.get("/health")
    def health():
        return {"status": "ok", "backend": backend.name}

    @app.get("/v1/models")
    def models():
        return {"object": "list",
                "data": [{"id": settings.model_id, "object": "model", "owned_by": "openbmb"}]}

    @app.post("/v1/audio/speech")
    def speech(body: SpeechRequest):
        if body.response_format not in ("wav", "pcm"):
            raise HTTPException(
                status_code=400,
                detail=f"response_format {body.response_format!r} not supported; "
                       "this service emits 'wav'")
        # voice name -> reference clip (unless an explicit reference was passed)
        ref = body.reference_wav_path or resolve_voice(body.voice, settings.voices_dir)
        req = SynthesisRequest(
            text=body.input, reference_wav_path=ref,
            prompt_wav_path=body.prompt_wav_path, prompt_text=body.prompt_text,
            cfg_value=body.cfg_value, inference_timesteps=body.inference_timesteps,
            normalize=body.normalize, denoise=body.denoise, seed=body.seed,
        )
        return _synthesize(req)

    @app.post("/v1/audio/clone")
    def clone(body: SpeechRequest):
        req = SynthesisRequest(
            text=body.input,
            reference_wav_path=body.reference_wav_path
                               or resolve_voice(body.voice, settings.voices_dir),
            prompt_wav_path=body.prompt_wav_path, prompt_text=body.prompt_text,
            cfg_value=body.cfg_value, inference_timesteps=body.inference_timesteps,
            normalize=body.normalize, denoise=body.denoise, seed=body.seed,
        )
        return _synthesize(req)

    return app
