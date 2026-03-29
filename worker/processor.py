from __future__ import annotations

from collections import defaultdict
from io import BytesIO
from typing import Any

import numpy as np
from PIL import Image
from insightface.app import FaceAnalysis
from sklearn.cluster import DBSCAN

from worker.config import Settings
from worker.models import ClusteredFace, FaceEmbeddingRecord, PhotoRecord, QueuedJob
from worker.repository import WorkerRepository


class FaceProcessor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.face_app = FaceAnalysis(name=settings.insightface_model_name)
        self.face_app.prepare(ctx_id=-1, det_size=settings.det_size)

    def process_job(self, repository: WorkerRepository, job: QueuedJob) -> None:
        photos = repository.get_job_photos(job.input_batch_id)
        repository.log_event(job.id, "job_started", {"photo_count": len(photos)})
        repository.update_job_progress(job.id, 10)

        embeddings = self._extract_embeddings(repository, job, photos)
        if not embeddings:
            repository.log_event(job.id, "job_finished_without_faces", {"photo_count": len(photos)})
            repository.mark_job_completed(job.id)
            return

        repository.update_job_progress(job.id, 55)
        clustered = self._cluster_embeddings(embeddings)
        repository.log_event(
            job.id,
            "faces_clustered",
            {"detected_faces": len(embeddings), "clustered_faces": len(clustered)},
        )

        repository.update_job_progress(job.id, 75)
        self._persist_clusters(repository, job, clustered, embeddings)
        repository.update_job_progress(job.id, 95)
        repository.mark_job_completed(job.id)
        repository.log_event(job.id, "job_completed", {"clusters": len({face.cluster_index for face in clustered})})

    def _extract_embeddings(
        self,
        repository: WorkerRepository,
        job: QueuedJob,
        photos: list[PhotoRecord],
    ) -> list[FaceEmbeddingRecord]:
        embeddings: list[FaceEmbeddingRecord] = []

        for index, photo in enumerate(photos, start=1):
            try:
                payload = repository.download_raw_photo(photo.storage_path)
                image = Image.open(BytesIO(payload)).convert("RGB")
                rgb = np.asarray(image)
                bgr = rgb[:, :, ::-1]
                faces = self.face_app.get(bgr)

                for face in faces:
                    bbox = tuple(float(value) for value in face.bbox.tolist())
                    width = bbox[2] - bbox[0]
                    height = bbox[3] - bbox[1]
                    if min(width, height) < self.settings.min_face_size:
                        continue

                    embeddings.append(
                        FaceEmbeddingRecord(
                            photo_id=photo.id,
                            storage_path=photo.storage_path,
                            bbox=bbox,
                            confidence=float(getattr(face, "det_score", 0.0)),
                            embedding=np.asarray(face.normed_embedding, dtype=np.float32),
                            face_area=width * height,
                            image_bytes=payload,
                        )
                    )
            except Exception as exc:  # noqa: BLE001
                repository.log_event(
                    job.id,
                    "photo_failed",
                    {"photo_id": photo.id, "storage_path": photo.storage_path, "message": str(exc)},
                )

            progress = 10 + int((index / max(len(photos), 1)) * 40)
            repository.update_job_progress(job.id, progress)

        repository.log_event(job.id, "faces_detected", {"detected_faces": len(embeddings)})
        return embeddings

    def _cluster_embeddings(
        self,
        embeddings: list[FaceEmbeddingRecord],
    ) -> list[ClusteredFace]:
        matrix = np.vstack([record.embedding for record in embeddings])
        model = DBSCAN(
            eps=self.settings.cluster_eps,
            min_samples=self.settings.cluster_min_samples,
            metric="cosine",
        )
        labels = model.fit_predict(matrix)

        return [
            ClusteredFace(
                cluster_index=int(cluster_index),
                photo_id=record.photo_id,
                storage_path=record.storage_path,
                bbox=record.bbox,
                confidence=record.confidence,
            )
            for record, cluster_index in zip(embeddings, labels, strict=True)
        ]

    def _persist_clusters(
        self,
        repository: WorkerRepository,
        job: QueuedJob,
        clustered_faces: list[ClusteredFace],
        source_embeddings: list[FaceEmbeddingRecord],
    ) -> None:
        grouped_faces: dict[int, list[ClusteredFace]] = defaultdict(list)
        by_photo_and_bbox: dict[tuple[str, tuple[float, float, float, float]], FaceEmbeddingRecord] = {
            (record.photo_id, record.bbox): record for record in source_embeddings
        }

        for face in clustered_faces:
            grouped_faces[face.cluster_index].append(face)

        face_rows: list[dict[str, Any]] = []
        cluster_photo_rows: list[dict[str, Any]] = []

        for cluster_number, cluster_index in enumerate(sorted(grouped_faces.keys()), start=1):
            faces = grouped_faces[cluster_index]
            label = f"Person_{cluster_number:03d}"
            preview_path = self._upload_cluster_preview(repository, job, label, faces, by_photo_and_bbox)
            photo_ids = sorted({face.photo_id for face in faces})

            cluster_id = repository.create_cluster(
                workspace_id=job.workspace_id,
                job_id=job.id,
                system_label=label,
                preview_path=preview_path,
                photo_count=len(photo_ids),
            )

            for photo_id in photo_ids:
                cluster_photo_rows.append(
                    {
                        "workspace_id": job.workspace_id,
                        "job_id": job.id,
                        "cluster_id": cluster_id,
                        "photo_id": photo_id,
                    }
                )

            for face in faces:
                face_rows.append(
                    {
                        "workspace_id": job.workspace_id,
                        "photo_id": face.photo_id,
                        "job_id": job.id,
                        "cluster_id": cluster_id,
                        "bbox": {
                            "x1": face.bbox[0],
                            "y1": face.bbox[1],
                            "x2": face.bbox[2],
                            "y2": face.bbox[3],
                        },
                        "confidence": face.confidence,
                        "embedding_ref": face.embedding_ref,
                    }
                )

        repository.insert_cluster_photos(cluster_photo_rows)
        repository.insert_detected_faces(face_rows)

    def _upload_cluster_preview(
        self,
        repository: WorkerRepository,
        job: QueuedJob,
        label: str,
        faces: list[ClusteredFace],
        lookup: dict[tuple[str, tuple[float, float, float, float]], FaceEmbeddingRecord],
    ) -> str | None:
        candidate = max(
            faces,
            key=lambda face: lookup[(face.photo_id, face.bbox)].face_area,
        )
        source = lookup[(candidate.photo_id, candidate.bbox)]
        image = Image.open(BytesIO(source.image_bytes)).convert("RGB")
        x1, y1, x2, y2 = [int(value) for value in candidate.bbox]
        crop = image.crop((x1, y1, x2, y2))

        output = BytesIO()
        crop.save(output, format="JPEG", quality=90)
        path = f"{job.workspace_id}/{job.id}/{label}.jpg"
        return repository.upload_preview(path, output.getvalue())
