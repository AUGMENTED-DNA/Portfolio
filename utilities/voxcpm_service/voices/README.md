# Voice library

Put named reference clips here as `<name>.wav`. The OpenAI `voice` parameter
resolves to the matching file (e.g. `voice: "alloy"` → `alloy.wav`), which the
cloning backend uses as the reference audio. A voice with no matching file falls
back to plain TTS.

Reference clips: ~5–15 seconds of clean, single-speaker audio (see the spec).

## Consent — required

Only add a clip for a voice you are **authorised** to use (your own, a consenting
speaker, or a properly licensed voice). Cloning a real person's voice without
their permission — to impersonate them, evade voice authentication, or deceive
listeners — is a misuse of this tool. You are responsible for how it is used.

This directory is git-ignored except for this README, so reference audio and the
voices you configure are never committed.
