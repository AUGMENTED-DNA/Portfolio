# VoxCPM speech service

An OpenAI-compatible text-to-speech + voice-cloning service built on OpenBMB's
**VoxCPM2**, from [`../voxcpm-voiceclone.md`](../voxcpm-voiceclone.md). The VoxCPM
API here was verified against the real package ([github.com/OpenBMB/VoxCPM](https://github.com/OpenBMB/VoxCPM)),
not just the spec.

## What runs where

- **This repo / any machine:** the service runs on the **mock backend** — a
  placeholder tone, not speech — so the API, WAV encoding, voice routing, and
  tests all work with no GPU, no weights, and no network. Good for wiring clients
  and CI.
- **A GPU box:** set `VOXCPM_BACKEND=voxcpm` to use the real 2B model. That needs
  `pip install voxcpm` + torch and multi-GB weights downloaded from Hugging Face
  on first run (see the spec §2 for VRAM). The real backend is coded against the
  verified API but was **not** run in this build environment (no GPU / HF egress).

## Install & run

```bash
cd utilities
pip install -r voxcpm_service/requirements.txt      # service + test deps
python -m voxcpm_service                             # mock backend, :8080
# real synthesis, on a GPU box:
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r voxcpm_service/requirements-voxcpm.txt
VOXCPM_BACKEND=voxcpm python -m voxcpm_service
```

## API

OpenAI-compatible, so it's a drop-in for an OpenAI/ElevenLabs TTS base URL (spec §6):

```bash
curl -X POST http://127.0.0.1:8080/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"input":"Deploy failed on US East 1. Rolling back.","voice":"alloy"}' \
  --output out.wav
```

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness + active backend |
| `GET /v1/models` | OpenAI-style model list |
| `POST /v1/audio/speech` | OpenAI-compatible TTS (`model`, `input`, `voice`, `response_format`) |
| `POST /v1/audio/clone` | VoxCPM-native cloning (reference / prompt inputs) |

The four spec modes map onto the request fields:

| Spec mode | Fields |
|---|---|
| A. Standard TTS | `input` only |
| B. Controllable cloning | `input` + `reference_wav_path` (or a `voice` that resolves to a clip) |
| C. Ultimate cloning | `input` + `prompt_wav_path` + `prompt_text` (+ optional `reference_wav_path`) |
| D. Voice design | style/persona tokens inside `input`, e.g. `"(a gentle, warm voice) Hello"` |

Extra VoxCPM controls (`cfg_value`, `inference_timesteps`, `seed`, `normalize`,
`denoise`) are accepted as optional fields.

## Layout

```
voxcpm_service/
├── app.py          # FastAPI, OpenAI-compatible endpoints
├── backends.py     # TTSBackend protocol; MockBackend + real VoxCPMBackend
├── schema.py       # SynthesisRequest + VoxCPM's both-or-neither prompt rule
├── wav.py          # float -> PCM16 WAV (stdlib only)
├── voices.py       # name -> reference clip (OpenAI `voice`)
├── config.py       # env-driven settings
├── __main__.py     # python -m voxcpm_service
├── voices/         # drop <name>.wav here (git-ignored; see its README + consent)
├── tests/          # 14 tests, mock backend, no GPU needed
├── requirements.txt / requirements-voxcpm.txt / .env.example
```

## Consent & responsible use

Voice cloning is powerful and easy to misuse. **Only clone a voice you are
authorised to use** — your own, a consenting speaker, or a licensed voice. Do not
use it to impersonate people, defeat voice authentication, or deceive listeners.
Reference audio and configured voices are git-ignored and never leave your machine
via this repo. VoxCPM itself is Apache-2.0; how you use it is your responsibility.
