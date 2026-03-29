# Worker

Фоновый worker отвечает за:

- чтение queued jobs из Supabase
- скачивание исходных фото из bucket `raw-photos`
- face detection и embeddings через InsightFace
- clustering через DBSCAN
- запись `person_clusters`, `cluster_photos`, `detected_faces`
- загрузку превью в bucket `face-previews`

Запуск локально:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r worker/requirements.txt
python3 -m worker.main
```

Для production worker предполагается отдельный container runtime, а не Vercel.

Рекомендуемый runtime для текущего проекта: `Railway`.

Минимальный набор env:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WORKER_ID`
- `PYTHON_WORKER_POLL_INTERVAL_SECONDS`
- `PYTHON_WORKER_CLUSTER_EPS`
- `PYTHON_WORKER_CLUSTER_MIN_SAMPLES`
- `PYTHON_WORKER_MIN_FACE_SIZE`
- `PYTHON_WORKER_MODEL_NAME`
