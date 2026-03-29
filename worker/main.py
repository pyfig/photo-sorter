from __future__ import annotations

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
    processor = FaceProcessor(settings)

    logger.info("worker started", extra={"worker_id": settings.worker_id})

    while True:
        job = repository.claim_next_job(settings.worker_id)
        if not job:
            time.sleep(settings.poll_interval_seconds)
            continue

        logger.info("claimed job %s", job.id)

        try:
            processor.process_job(repository, job)
        except Exception as exc:  # noqa: BLE001
            logger.exception("job %s failed", job.id)
            repository.log_event(
                job.id,
                "job_failed",
                {"message": str(exc)},
            )
            repository.mark_job_failed(job.id, str(exc))


if __name__ == "__main__":
    main()

