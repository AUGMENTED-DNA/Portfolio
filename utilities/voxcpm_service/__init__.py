"""VoxCPM voice-clone / TTS service.

An OpenAI-compatible speech service around OpenBMB's VoxCPM2, with a pluggable
backend so it runs offline (mock) here and on real weights (voxcpm) on a GPU box.
Built from ../voxcpm-voiceclone.md, with the API verified against the real
github.com/OpenBMB/VoxCPM package.
"""
__version__ = "0.1.0"
