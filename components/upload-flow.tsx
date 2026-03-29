"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { shortId } from "@/lib/utils";

interface UploadFlowProps {
  workspaceId: string;
}

type UploadStep =
  | "idle"
  | "creating-upload"
  | "uploading-files"
  | "registering-files"
  | "creating-job"
  | "completed";

const flowSteps = [
  {
    key: "creating-upload",
    title: "Подготовить загрузку",
    description: "Создаём запись и подготавливаем спокойный контейнер для снимков."
  },
  {
    key: "uploading-files",
    title: "Передать фотографии",
    description: "Передаём файлы в хранилище и следим, чтобы маршрут не оборвался."
  },
  {
    key: "registering-files",
    title: "Сохранить в проект",
    description: "Фиксируем фото в проекте, чтобы они попали в очередь обработки."
  },
  {
    key: "creating-job",
    title: "Запустить обработку",
    description: "Создаём задачу и сразу переводим вас к её статусу."
  }
] as const;

function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  const canSubmit =
    files.length > 0 &&
    step !== "creating-upload" &&
    step !== "uploading-files" &&
    step !== "registering-files" &&
    step !== "creating-job";

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

      setUploadId(uploadPayload.upload.id);
      setStep("uploading-files");
      setStepMessage("Передаём фотографии в хранилище...");

      const supabase = createSupabaseBrowserClient();
      const registeredFiles: Array<{ storagePath: string }> = [];

      for (const [index, file] of files.entries()) {
        const safeName = sanitizeFileName(file.name) || `photo-${index + 1}.jpg`;
        const storagePath = `${uploadPayload.storagePrefix}/${String(index + 1).padStart(3, "0")}-${safeName}`;

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

        registeredFiles.push({ storagePath });
        setStepMessage(`Загружено ${index + 1} из ${files.length} фото.`);
      }

      setStep("registering-files");
      setStepMessage("Добавляем фотографии в проект...");

      const registerResponse = await fetch(
        `/api/workspaces/${workspaceId}/uploads/${uploadPayload.upload.id}/photos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ files: registeredFiles })
        }
      );

      const registerPayload = (await registerResponse.json()) as { error?: string };

      if (!registerResponse.ok) {
        throw new Error(registerPayload.error ?? "Не удалось зарегистрировать фотографии");
      }

      setStep("creating-job");
      setStepMessage("Запускаем обработку...");

      const jobResponse = await fetch(`/api/workspaces/${workspaceId}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ uploadId: uploadPayload.upload.id })
      });

      const jobPayload = (await jobResponse.json()) as {
        error?: string;
        job?: { id: string };
      };

      if (!jobResponse.ok || !jobPayload.job) {
        throw new Error(jobPayload.error ?? "Не удалось запустить обработку");
      }

      let completionMessage = "Фотографии загружены. Обработка уже стоит в очереди.";
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
            ? `Фотографии загружены, но worker runtime недоступен: ${workerRuntime.error}`
            : "Фотографии загружены, но worker runtime пока не отвечает. Job останется в очереди, пока не появится consumer.";
        }
      } catch {
        // Health-check here is advisory only; upload flow itself is already complete.
      }

      setJobId(jobPayload.job.id);
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
          Добавьте подборку фотографий. Сервис сам зарегистрирует файлы, подготовит очередь
          и переведёт вас к статусу обработки без лишних ручных шагов.
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
        {uploadId ? <span>Загрузка #{shortId(uploadId)}</span> : null}
      </div>

      <p className="helper-copy">
        Поддерживаются JPEG и PNG. После отправки вы сразу увидите статус обработки.
      </p>

      <div className="actions">
        <button className="button" disabled={!canSubmit} onClick={handleUpload} type="button">
          {step === "idle" ? "Загрузить фото и начать обработку" : "Выполняем шаги..."}
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
