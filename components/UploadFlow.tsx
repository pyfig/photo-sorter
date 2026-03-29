"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { shortId } from "@/lib/utils";

interface UploadFlowProps {
  workspaceId: string;
}

interface UploadStats {
  total: number;
  uploaded: number;
  registered: number;
  failed: number;
}

interface RegisterPhotoResponse {
  error?: string;
  job?: {
    id: string;
    status: string;
    phase: string | null;
    progressPercent: number;
    totalPhotos: number;
    processedPhotos: number;
  };
}

interface CompleteUploadResponse {
  error?: string;
  job?: {
    id: string;
    status: string;
    phase: string | null;
    progressPercent: number;
    totalPhotos: number;
    processedPhotos: number;
  } | null;
}

type UploadStep =
  | "idle"
  | "creating-upload"
  | "uploading-files"
  | "sealing-upload"
  | "completed";

const MAX_PARALLEL_UPLOADS = 4;

const flowSteps = [
  {
    key: "creating-upload",
    title: "Подготовить загрузку",
    description: "Создаём upload batch и готовим защищённый префикс для файлов."
  },
  {
    key: "uploading-files",
    title: "Передать и зарегистрировать фото",
    description:
      "Грузим несколько файлов параллельно, а каждый успешный upload сразу ставим в preprocessing."
  },
  {
    key: "sealing-upload",
    title: "Закрыть подборку",
    description:
      "Фиксируем конец batch, чтобы worker мог перейти от пофайловой подготовки к финальной кластеризации."
  }
] as const;

function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getProgressMessage(stats: UploadStats): string {
  return `Загружено ${stats.uploaded}/${stats.total}, зарегистрировано ${stats.registered}/${stats.total}, ошибок ${stats.failed}.`;
}

export function UploadFlow({ workspaceId }: UploadFlowProps) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [batchName, setBatchName] = useState("");
  const [step, setStep] = useState<UploadStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<UploadStats>({
    total: 0,
    uploaded: 0,
    registered: 0,
    failed: 0
  });

  const isBusy = step !== "idle" && step !== "completed";
  const canSubmit = files.length > 0 && !isBusy;

  async function handleUpload() {
    setError(null);
    setJobId(null);
    setUploadId(null);

    if (files.length === 0) {
      setError("Выберите хотя бы один JPEG или PNG файл.");
      return;
    }

    const resolvedBatchName =
      batchName.trim() ||
      `upload-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

    const currentStats: UploadStats = {
      total: files.length,
      uploaded: 0,
      registered: 0,
      failed: 0
    };
    setStats(currentStats);

    const setProgress = (patch: Partial<UploadStats>) => {
      Object.assign(currentStats, patch);
      setStats({ ...currentStats });
      setStepMessage(getProgressMessage(currentStats));
    };

    try {
      setStep("creating-upload");
      setStepMessage("Подготавливаем новую загрузку...");

      const uploadResponse = await fetch(
        `/api/workspaces/${workspaceId}/uploads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: resolvedBatchName })
        }
      );

      const uploadPayload = (await uploadResponse.json()) as {
        error?: string;
        storagePrefix?: string;
        upload?: { id: string };
      };

      if (!uploadResponse.ok || !uploadPayload.upload || !uploadPayload.storagePrefix) {
        throw new Error(uploadPayload.error ?? "Не удалось подготовить загрузку");
      }

      const currentUploadId = uploadPayload.upload.id;
      const storagePrefix = uploadPayload.storagePrefix;

      setUploadId(currentUploadId);
      setStep("uploading-files");
      setStepMessage(getProgressMessage(currentStats));

      const supabase = createSupabaseBrowserClient();
      const fileErrors: string[] = [];
      let nextIndex = 0;

      const processFile = async (file: File, index: number) => {
        const safeName = sanitizeFileName(file.name) || `photo-${index + 1}.jpg`;
        const storagePath = `${storagePrefix}/${String(index + 1).padStart(3, "0")}-${safeName}`;

        const { error: storageError } = await supabase.storage
          .from("raw-photos")
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type || undefined,
            upsert: false
          });

        if (storageError) {
          throw new Error(`Не удалось загрузить ${file.name}: ${storageError.message}`);
        }

        setProgress({ uploaded: currentStats.uploaded + 1 });

        const registerResponse = await fetch(
          `/api/workspaces/${workspaceId}/uploads/${currentUploadId}/photos`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              file: {
                storagePath
              }
            })
          }
        );

        const registerPayload = (await registerResponse.json()) as RegisterPhotoResponse;
        if (!registerResponse.ok) {
          throw new Error(registerPayload.error ?? `Не удалось зарегистрировать ${file.name}`);
        }

        if (registerPayload.job?.id) {
          setJobId(registerPayload.job.id);
        }

        setProgress({ registered: currentStats.registered + 1 });
      };

      await Promise.all(
        Array.from(
          { length: Math.min(MAX_PARALLEL_UPLOADS, files.length) },
          async () => {
            while (true) {
              const currentIndex = nextIndex;
              nextIndex += 1;

              if (currentIndex >= files.length) {
                return;
              }

              try {
                await processFile(files[currentIndex], currentIndex);
              } catch (fileError) {
                const message =
                  fileError instanceof Error
                    ? fileError.message
                    : `Не удалось обработать ${files[currentIndex].name}`;
                fileErrors.push(message);
                setProgress({ failed: currentStats.failed + 1 });
              }
            }
          }
        )
      );

      if (currentStats.registered === 0) {
        throw new Error(
          fileErrors[0] ?? "Не удалось загрузить ни одного файла. Upload batch не был завершён."
        );
      }

      setStep("sealing-upload");
      setStepMessage("Закрываем upload batch и переводим обработку к финальному этапу...");

      const completeResponse = await fetch(
        `/api/workspaces/${workspaceId}/uploads/${currentUploadId}/complete`,
        {
          method: "POST"
        }
      );

      const completePayload = (await completeResponse.json()) as CompleteUploadResponse;
      if (!completeResponse.ok) {
        throw new Error(completePayload.error ?? "Не удалось закрыть upload batch");
      }

      if (completePayload.job?.id) {
        setJobId(completePayload.job.id);
      }

      let completionMessage =
        currentStats.failed > 0
          ? `Подборка закрыта. Успешно зарегистрировано ${currentStats.registered} из ${currentStats.total} фото, ${currentStats.failed} файлов пропущены.`
          : "Подборка закрыта. Обработка продолжается автоматически без дополнительных действий.";

      try {
        const healthResponse = await fetch("/api/health", { cache: "no-store" });
        const healthPayload = (await healthResponse.json()) as {
          checks?: {
            workerRuntime?: {
              status?: string;
              error?: string | null;
            };
          };
        };
        const workerRuntime = healthPayload.checks?.workerRuntime;

        if (workerRuntime?.status !== "ok") {
          completionMessage = workerRuntime?.error
            ? `${completionMessage} Worker runtime недоступен: ${workerRuntime.error}`
            : `${completionMessage} Worker runtime пока не отвечает, поэтому pipeline может задержаться.`;
        }
      } catch {
        // Health-check here is advisory only; upload flow itself is already complete.
      }

      setStep("completed");
      setStepMessage(completionMessage);
      startTransition(() => {
        router.refresh();
      });
    } catch (uploadError) {
      setStep("idle");
      setStepMessage(null);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не удалось завершить загрузку"
      );
    }
  }

  const currentStepIndex =
    step === "idle"
      ? -1
      : step === "completed"
        ? flowSteps.length
        : flowSteps.findIndex((item) => item.key === step);

  return (
    <section className="panel upload-flow-panel">
      <div className="panel-intro">
        <h2>Новая загрузка</h2>
        <p className="muted">
          Добавьте подборку фотографий. Сервис загрузит файлы параллельно, а каждое
          успешно переданное фото сразу отправит в preprocessing без ожидания конца batch.
        </p>
      </div>

      <div className="progress-steps" aria-label="Шаги загрузки">
        {flowSteps.map((flowStep, index) => {
          const state =
            currentStepIndex > index
              ? "done"
              : currentStepIndex === index
                ? "active"
                : "pending";

          return (
            <article className={`progress-step ${state}`} key={flowStep.key}>
              <span className="progress-step-indicator">{index + 1}</span>
              <div>
                <strong>{flowStep.title}</strong>
                <p className="muted">{flowStep.description}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Название загрузки</span>
          <input
            onChange={(event) => setBatchName(event.target.value)}
            placeholder="Съёмка 1 августа"
            type="text"
            value={batchName}
          />
        </label>

        <label className="field">
          <span>Фотографии</span>
          <input
            accept="image/jpeg,image/png"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            type="file"
          />
        </label>
      </div>

      <div className="list-inline" style={{ marginBottom: 16 }}>
        <span>Выбрано фото: {files.length}</span>
        <span>Параллельных upload: {Math.min(MAX_PARALLEL_UPLOADS, Math.max(files.length, 1))}</span>
        {uploadId ? <span>Загрузка #{shortId(uploadId)}</span> : null}
      </div>

      {stats.total > 0 ? (
        <div className="list-inline" style={{ marginBottom: 16 }}>
          <span>В storage: {stats.uploaded}</span>
          <span>В preprocessing: {stats.registered}</span>
          <span>Ошибок: {stats.failed}</span>
        </div>
      ) : null}

      <p className="helper-copy">
        Поддерживаются JPEG и PNG. После первого успешно переданного файла job создаётся
        автоматически, а статус обработки можно открыть сразу.
      </p>

      <div className="actions">
        <button className="button" disabled={!canSubmit} onClick={handleUpload} type="button">
          {step === "idle" || step === "completed"
            ? "Загрузить фото и начать обработку"
            : "Выполняем шаги..."}
        </button>
      </div>

      {stepMessage ? (
        <p className={`notice ${step === "completed" ? "success" : "info"}`}>{stepMessage}</p>
      ) : null}
      {error ? <p className="notice error">{error}</p> : null}
      {jobId ? (
        <div className="actions">
          <Link className="button-secondary" href={`/workspaces/${workspaceId}/jobs/${jobId}`}>
            Открыть статус обработки
          </Link>
        </div>
      ) : null}
    </section>
  );
}
