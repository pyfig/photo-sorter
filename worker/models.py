from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class QueuedJob:
    id: str
    workspace_id: str
    input_batch_id: str
    status: str


@dataclass(frozen=True)
class PhotoRecord:
    id: str
    workspace_id: str
    upload_id: str
    storage_path: str


@dataclass
class FaceEmbeddingRecord:
    photo_id: str
    storage_path: str
    bbox: tuple[float, float, float, float]
    confidence: float
    embedding: Any
    face_area: float
    image_bytes: bytes


@dataclass(frozen=True)
class ClusteredFace:
    cluster_index: int
    photo_id: str
    storage_path: str
    bbox: tuple[float, float, float, float]
    confidence: float
    embedding_ref: str | None = None

