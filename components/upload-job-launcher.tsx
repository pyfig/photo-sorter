"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UploadJobLauncherProps {
  workspaceId: string;
  uploadId: string;
}

export function UploadJobLauncher({
  workspaceId,
  uploadId
}: UploadJobLauncherProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLaunch() {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ uploadId })
      });

      const payload = (await response.json()) as {
        error?: string;
        job?: { id: string };
      };

      if (!response.ok || !payload.job) {
        throw new Error(payload.error ?? "Не удалось запустить обработку");
      }

      router.push(`/workspaces/${workspaceId}/jobs/${payload.job.id}`);
      router.refresh();
    } catch (launchError) {
      setError(
        launchError instanceof Error
          ? launchError.message
          : "Не удалось запустить обработку"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 8 }}>
      <button
        className="button-secondary"
        disabled={isSubmitting}
        onClick={handleLaunch}
        type="button"
      >
        {isSubmitting ? "Запускаем..." : "Запустить обработку"}
      </button>
      {error ? <span className="muted">{error}</span> : null}
    </div>
  );
}
