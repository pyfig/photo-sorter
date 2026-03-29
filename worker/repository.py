from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import Client, create_client

from worker.config import Settings
from worker.models import PhotoRecord, QueuedJob


class WorkerRepository:
    def __init__(self, settings: Settings) -> None:
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
