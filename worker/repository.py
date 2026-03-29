from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client, create_client

from worker.config import Settings
from worker.models import PhotoRecord, QueuedJob


class WorkerRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )

    def claim_next_job(self, worker_id: str) -> QueuedJob | None:
        response = self.client.rpc(
            "claim_next_processing_job",
            {"worker_name": worker_id},
        ).execute()

        row = response.data
        if not row:
            return None

        if isinstance(row, list):
            row = row[0] if row else None

        if not row:
            return None

        if not isinstance(row, dict):
            return None

        if not row.get("id") or not row.get("workspace_id") or not row.get("input_batch_id"):
            return None

        return QueuedJob(
            id=row["id"],
            workspace_id=row["workspace_id"],
            input_batch_id=row["input_batch_id"],
            status=row["status"],
        )

    def get_job_photos(self, upload_id: str) -> list[PhotoRecord]:
        response = (
            self.client.table("photos")
            .select("id, workspace_id, upload_id, storage_path")
            .eq("upload_id", upload_id)
            .order("created_at", desc=False)
            .execute()
        )

        return [
            PhotoRecord(
                id=row["id"],
                workspace_id=row["workspace_id"],
                upload_id=row["upload_id"],
                storage_path=row["storage_path"],
            )
            for row in (response.data or [])
        ]

    def download_raw_photo(self, storage_path: str) -> bytes:
        return self.client.storage.from_("raw-photos").download(storage_path)

    def upload_preview(self, path: str, payload: bytes) -> str:
        self.client.storage.from_("face-previews").upload(
            path,
            payload,
            {"content-type": "image/jpeg"},
        )
        return path

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
