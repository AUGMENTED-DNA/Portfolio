"""Run the service: python -m voxcpm_service"""
from __future__ import annotations

from .app import create_app
from .config import load_settings


def main() -> None:
    import uvicorn
    settings = load_settings()
    app = create_app(settings)
    print(f"VoxCPM service: backend={settings.backend} model={settings.model_id} "
          f"-> http://{settings.host}:{settings.port}")
    if settings.backend == "mock":
        print("  (mock backend — emits a placeholder tone, NOT speech. Set "
              "VOXCPM_BACKEND=voxcpm on a GPU box for real synthesis.)")
    uvicorn.run(app, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
