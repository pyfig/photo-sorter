from __future__ import annotations

from datetime import datetime, timezone
import logging
import time

from worker.config import load_settings
from worker.processor import FaceProcessor
from worker.repository import WorkerRepository


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def main() -> None:
    configure_logging()
    logger = logging.getLogger("photo-sorter-worker")
    settings = load_settings()
    repository = WorkerRepository(settings)
    repository.mark_worker_started(settings.worker_id)
    processor = FaceProcessor(settings)

    logger.info("worker started", extra={"worker_id": settings.worker_id})

    while True:
        repository.mark_worker_idle(settings.worker_id)
        photo_task = repository.claim_next_photo_task(settings.worker_id)
        if photo_task:
            logger.info("claimed photo task %s", photo_task.id)
            job_started_at = datetime.now(timezone.utc).isoformat()
            repository.mark_worker_running(
                settings.worker_id,
                photo_task.job_id,
                job_started_at,
            )

            try:
                processor.process_photo_task(repository, photo_task, job_started_at)
                repository.mark_worker_idle(
                    settings.worker_id,
                    last_job_id=photo_task.job_id,
                    clear_last_error=True,
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("photo task %s failed", photo_task.id)
                repository.log_event(
                    photo_task.job_id,
                    "photo_preprocessing_failed",
                    {
                        "photo_id": photo_task.photo_id,
                        "message": str(exc),
                    },
                )
                repository.mark_photo_task_failed(photo_task.id, str(exc))
                repository.sync_job_progress(photo_task.job_id)
                repository.mark_worker_idle(
                    settings.worker_id,
                    last_job_id=photo_task.job_id,
                    last_error=str(exc),
                )
            continue

        job = repository.claim_next_finalizable_job(settings.worker_id)
        if not job:
            time.sleep(settings.poll_interval_seconds)
            continue

        logger.info("claimed finalizable job %s", job.id)
        job_started_at = datetime.now(timezone.utc).isoformat()
        repository.mark_worker_running(settings.worker_id, job.id, job_started_at)

        try:
            processor.finalize_job(repository, job, job_started_at)
            repository.mark_worker_idle(
                settings.worker_id,
                last_job_id=job.id,
                clear_last_error=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("job %s failed", job.id)
            repository.log_event(
                job.id,
                "job_failed",
                {"message": str(exc)},
            )
            repository.mark_job_failed(job.id, str(exc))
            repository.mark_worker_idle(
                settings.worker_id,
                last_job_id=job.id,
                last_error=str(exc),
            )


if __name__ == "__main__":
    main()
