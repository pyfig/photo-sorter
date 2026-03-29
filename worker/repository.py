from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client, create_client

from worker.config import Settings
from worker.models import PhotoProcessingTask, PhotoRecord, ProcessingJob, StagedFaceRecord


def _unwrap_single_row(data: Any) -> dict[str, Any] | None:
    if not data:
        return None

    if isinstance(data, list):
        data = data[0] if data else None

    if not isinstance(data, dict):
        return None

    return data


def _parse_bbox(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, dict):
        return None

    try:
        x1 = float(value["x1"])
        y1 = float(value["y1"])
        x2 = float(value["x2"])
        y2 = float(value["y2"])
    except (KeyError, TypeError, ValueError):
        return None

    if x2 <= x1 or y2 <= y1:
        return None

    return (x1, y1, x2, y2)


class WorkerRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )

    def claim_next_photo_task(self, worker_id: str) -> PhotoProcessingTask | None:
        response = self.client.rpc(
            "claim_next_photo_processing_task",
            {"worker_name": worker_id},
        ).execute()

        row = _unwrap_single_row(response.data)
        if not row:
            return None

        required = ("id", "workspace_id", "upload_id", "photo_id", "job_id", "status")
        if any(not row.get(field) for field in required):
            return None

        return PhotoProcessingTask(
            id=row["id"],
            workspace_id=row["workspace_id"],
            upload_id=row["upload_id"],
            photo_id=row["photo_id"],
            job_id=row["job_id"],
            status=row["status"],
        )

    def claim_next_finalizable_job(self, worker_id: str) -> ProcessingJob | None:
        response = self.client.rpc(
            "claim_next_finalizable_processing_job",
            {"worker_name": worker_id},
        ).execute()

        row = _unwrap_single_row(response.data)
        if not row:
            return None

        required = ("id", "workspace_id", "input_batch_id", "status", "phase")
        if any(not row.get(field) for field in required):
            return None

        return ProcessingJob(
            id=row["id"],
            workspace_id=row["workspace_id"],
            input_batch_id=row["input_batch_id"],
            status=row["status"],
            phase=row["phase"],
            total_photos=int(row.get("total_photos") or 0),
            processed_photos=int(row.get("processed_photos") or 0),
        )

    def get_photo(self, photo_id: str) -> PhotoRecord | None:
        response = (
            self.client.table("photos")
            .select("id, workspace_id, upload_id, storage_path")
            .eq("id", photo_id)
            .limit(1)
            .execute()
        )

        row = _unwrap_single_row(response.data)
        if not row:
            return None

        return PhotoRecord(
            id=row["id"],
            workspace_id=row["workspace_id"],
            upload_id=row["upload_id"],
            storage_path=row["storage_path"],
        )

    def get_staged_faces_for_job(self, job_id: str) -> list[StagedFaceRecord]:
        response = (
            self.client.table("staged_faces")
            .select("photo_id, storage_path, bbox, confidence, embedding")
            .eq("job_id", job_id)
            .order("created_at", desc=False)
            .execute()
        )

        faces: list[StagedFaceRecord] = []
        for row in response.data or []:
            bbox = _parse_bbox(row.get("bbox"))
            if not bbox:
                continue

            embedding = row.get("embedding")
            if not isinstance(embedding, list):
                continue

            face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
            faces.append(
                StagedFaceRecord(
                    photo_id=row["photo_id"],
                    storage_path=row["storage_path"],
                    bbox=bbox,
                    confidence=float(row.get("confidence") or 0.0),
                    embedding=embedding,
                    face_area=face_area,
                )
            )

        return faces

    def clear_staged_faces(self, job_id: str) -> None:
        self.client.table("staged_faces").delete().eq("job_id", job_id).execute()

    def download_raw_photo(self, storage_path: str) -> bytes:
        return self.client.storage.from_("raw-photos").download(storage_path)

    def upload_preview(self, path: str, payload: bytes) -> str:
        self.client.storage.from_("face-previews").upload(
            path,
            payload,
            {"content-type": "image/jpeg"},
        )
        return path

    def insert_staged_faces(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return

        self.client.table("staged_faces").insert(rows).execute()

    def mark_photo_task_completed(self, task_id: str) -> None:
        (
            self.client.table("photo_processing_tasks")
            .update(
                {
                    "status": "completed",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "error_message": None,
                }
            )
            .eq("id", task_id)
            .execute()
        )

    def mark_photo_task_failed(self, task_id: str, message: str) -> None:
        (
            self.client.table("photo_processing_tasks")
            .update(
                {
                    "status": "failed",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "error_message": message,
                }
            )
            .eq("id", task_id)
            .execute()
        )

    def sync_job_progress(self, job_id: str) -> ProcessingJob:
        job_response = (
            self.client.table("processing_jobs")
            .select("id, workspace_id, input_batch_id, status, phase, progress_percent")
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        row = _unwrap_single_row(job_response.data)
        if not row:
            raise RuntimeError(f"processing_job {job_id} not found")

        total_response = (
            self.client.table("photo_processing_tasks")
            .select("id", count="exact")
            .eq("job_id", job_id)
            .execute()
        )
        processed_response = (
            self.client.table("photo_processing_tasks")
            .select("id", count="exact")
            .eq("job_id", job_id)
            .in_("status", ["completed", "failed"])
            .execute()
        )

        total_photos = int(total_response.count or 0)
        processed_photos = int(processed_response.count or 0)
        phase = str(row.get("phase") or "preprocessing")
        current_progress = int(row.get("progress_percent") or 0)

        if phase == "finalizing":
            progress_percent = max(current_progress, 85)
        elif total_photos <= 0:
            progress_percent = max(current_progress, 1)
        else:
            progress_percent = max(
                1,
                min(80, round((processed_photos / total_photos) * 80)),
            )

        update_response = (
            self.client.table("processing_jobs")
            .update(
                {
                    "total_photos": total_photos,
                    "processed_photos": processed_photos,
                    "progress_percent": progress_percent,
                }
            )
            .eq("id", job_id)
            .execute()
        )

        updated = _unwrap_single_row(update_response.data) or {}
        return ProcessingJob(
            id=str(updated.get("id") or row["id"]),
            workspace_id=str(updated.get("workspace_id") or row["workspace_id"]),
            input_batch_id=str(updated.get("input_batch_id") or row["input_batch_id"]),
            status=str(updated.get("status") or row["status"]),
            phase=str(updated.get("phase") or phase),
            total_photos=total_photos,
            processed_photos=processed_photos,
        )

    def update_job_progress(self, job_id: str, progress_percent: int) -> None:
        (
            self.client.table("processing_jobs")
            .update({"progress_percent": progress_percent})
            .eq("id", job_id)
            .execute()
        )

    def mark_job_failed(self, job_id: str, message: str) -> None:
        (
            self.client.table("processing_jobs")
            .update(
                {
                    "status": "failed",
                    "error_message": message,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "progress_percent": 100,
                }
            )
            .eq("id", job_id)
            .execute()
        )

    def mark_job_completed(self, job_id: str) -> None:
        (
            self.client.table("processing_jobs")
            .update(
                {
                    "status": "completed",
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "progress_percent": 100,
                }
            )
            .eq("id", job_id)
            .execute()
        )

    def log_event(
        self,
        job_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        (
            self.client.table("job_events")
            .insert(
                {
                    "job_id": job_id,
                    "event_type": event_type,
                    "payload": payload,
                }
            )
            .execute()
        )

    def create_cluster(
        self,
        workspace_id: str,
        job_id: str,
        system_label: str,
        preview_path: str | None,
        photo_count: int,
    ) -> str:
        response = (
            self.client.table("person_clusters")
            .insert(
                {
                    "workspace_id": workspace_id,
                    "job_id": job_id,
                    "system_label": system_label,
                    "display_name": system_label,
                    "preview_path": preview_path,
                    "photo_count": photo_count,
                }
            )
            .execute()
        )

        return response.data[0]["id"]

    def insert_detected_faces(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        self.client.table("detected_faces").insert(rows).execute()

    def insert_cluster_photos(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        self.client.table("cluster_photos").insert(rows).execute()

    def mark_worker_started(self, worker_id: str) -> None:
        self._upsert_worker_heartbeat(
            worker_id,
            runtime_status="starting",
            current_job_id=None,
            current_job_started_at=None,
            last_error=None,
        )

    def mark_worker_running(
        self,
        worker_id: str,
        job_id: str,
        job_started_at: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "current_job_id": job_id,
            "last_error": None,
        }
        if job_started_at is not None:
            payload["current_job_started_at"] = job_started_at

        self._upsert_worker_heartbeat(
            worker_id,
            runtime_status="running",
            **payload,
        )

    def mark_worker_idle(
        self,
        worker_id: str,
        last_job_id: str | None = None,
        last_error: str | None = None,
        clear_last_error: bool = False,
    ) -> None:
        payload: dict[str, Any] = {
            "current_job_id": None,
            "current_job_started_at": None,
        }
        if last_error is not None or clear_last_error:
            payload["last_error"] = last_error
        if last_job_id is not None:
            payload["last_job_id"] = last_job_id
            payload["last_completed_at"] = datetime.now(timezone.utc).isoformat()

        self._upsert_worker_heartbeat(
            worker_id,
            runtime_status="idle",
            **payload,
        )

    def _upsert_worker_heartbeat(
        self,
        worker_id: str,
        runtime_status: str,
        **fields: Any,
    ) -> None:
        payload: dict[str, Any] = {
            "worker_id": worker_id,
            "runtime_status": runtime_status,
            "poll_interval_seconds": self.settings.poll_interval_seconds,
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {
                "runtime": "python-worker",
                "model_name": self.settings.insightface_model_name,
            },
        }
        payload.update(fields)

        (
            self.client.table("worker_heartbeats")
            .upsert(payload, on_conflict="worker_id")
            .execute()
        )
