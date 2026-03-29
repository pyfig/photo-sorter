from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_service_role_key: str
    worker_id: str = "photo-sorter-worker"
    poll_interval_seconds: int = 10
    cluster_eps: float = 0.35
    cluster_min_samples: int = 1
    min_face_size: int = 48
    insightface_model_name: str = "buffalo_l"
    det_size: tuple[int, int] = (640, 640)


def load_settings() -> Settings:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
        )

    return Settings(
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        worker_id=os.getenv("WORKER_ID", "photo-sorter-worker"),
        poll_interval_seconds=int(os.getenv("PYTHON_WORKER_POLL_INTERVAL_SECONDS", "10")),
        cluster_eps=float(os.getenv("PYTHON_WORKER_CLUSTER_EPS", "0.35")),
        cluster_min_samples=int(os.getenv("PYTHON_WORKER_CLUSTER_MIN_SAMPLES", "1")),
        min_face_size=int(os.getenv("PYTHON_WORKER_MIN_FACE_SIZE", "48")),
        insightface_model_name=os.getenv("PYTHON_WORKER_MODEL_NAME", "buffalo_l"),
    )

