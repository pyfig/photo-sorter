"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
      setStepMessage("Создаю upload batch...");

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
        throw new Error(uploadPayload.error ?? "Не удалось создать upload batch");
      }

      setUploadId(uploadPayload.upload.id);
      setStep("uploading-files");
      setStepMessage("Загружаю файлы в Supabase Storage...");

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
        setStepMessage(`Загружено ${index + 1} из ${files.length} файлов...`);
      }

      setStep("registering-files");
      setStepMessage("Регистрирую файлы в базе...");

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
      setStepMessage("Создаю processing job...");

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
        throw new Error(jobPayload.error ?? "Не удалось создать processing job");
      }

      setJobId(jobPayload.job.id);
      setStep("completed");
      setStepMessage("Upload завершен, job поставлен в очередь.");
      startTransition(() => {
        router.refresh();
      });
    } catch (uploadError) {
      setStep("idle");
      setStepMessage(null);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не удалось завершить upload flow"
      );
    }
  }

  return (
    <section className="panel">
      <h2>Новый upload batch</h2>
      <div className="form-grid">
        <label className="field">
          <span>Название батча</span>
          <input
            onChange={(event) => setBatchName(event.target.value)}
            placeholder="conference-day-1"
            type="text"
            value={batchName}
          />
        </label>

        <label className="field">
          <span>Файлы</span>
          <input
            accept="image/jpeg,image/png"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            type="file"
          />
        </label>
      </div>

      <div className="list-inline" style={{ marginBottom: 16 }}>
        <span>Выбрано файлов: {files.length}</span>
        {uploadId ? <span>upload: {uploadId}</span> : null}
      </div>

      <div className="actions">
        <button className="button" disabled={!canSubmit} onClick={handleUpload} type="button">
          {step === "idle" ? "Загрузить и запустить job" : "В работе..."}
        </button>
      </div>

      {stepMessage ? <p className="notice success">{stepMessage}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
      {jobId ? (
        <div className="actions">
          <a className="button-secondary" href={`/workspaces/${workspaceId}/jobs/${jobId}`}>
            Открыть job
          </a>
        </div>
      ) : null}
    </section>
  );
}
