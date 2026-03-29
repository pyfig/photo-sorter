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

