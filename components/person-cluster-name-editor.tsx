"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getPersonClusterDisplayNameError,
  normalizePersonClusterDisplayName,
  PERSON_CLUSTER_DISPLAY_NAME_MAX_LENGTH
} from "@/lib/person-cluster-name";

interface PersonClusterNameEditorProps {
  workspaceId: string;
  personId: string;
  initialDisplayName: string;
}

export function PersonClusterNameEditor({
  workspaceId,
  personId,
  initialDisplayName
}: PersonClusterNameEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentName, setCurrentName] = useState(initialDisplayName);
  const [draftName, setDraftName] = useState(initialDisplayName);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setCurrentName(initialDisplayName);

    if (!isEditing) {
      setDraftName(initialDisplayName);
    }
  }, [initialDisplayName, isEditing]);

  async function handleSave() {
    const validationError = getPersonClusterDisplayNameError(draftName);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    const normalizedDisplayName = normalizePersonClusterDisplayName(draftName);
    if (normalizedDisplayName === currentName) {
      setIsEditing(false);
      setDraftName(currentName);
      setError(null);
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(
        `/api/workspaces/${workspaceId}/people/${personId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ displayName: normalizedDisplayName })
        }
      );

      const payload = (await response.json()) as {
        error?: string;
        person?: { displayName?: string };
      };

      if (!response.ok || !payload.person?.displayName) {
        throw new Error(payload.error ?? "Не удалось обновить имя группы");
      }

      setCurrentName(payload.person.displayName);
      setDraftName(payload.person.displayName);
      setIsEditing(false);
      setSuccess(
        "Имя сохранено. Оно уже используется в интерфейсе и станет базой для будущего имени папки."
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Не удалось обновить имя группы"
      );
      setSuccess(null);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setDraftName(currentName);
    setError(null);
    setSuccess(null);
    setIsEditing(false);
  }

  return (
    <section className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-intro">
        <h2>Имя группы</h2>
        <p className="muted">
          Задайте человеку понятное имя. Это название уже видно в интерфейсе и позже
          сможет стать базой для имени папки при экспорте результата.
        </p>
      </div>

      {isEditing ? (
        <div className="form-grid">
          <label className="field">
            <span>Имя группы и будущей папки</span>
            <input
              autoComplete="off"
              maxLength={PERSON_CLUSTER_DISPLAY_NAME_MAX_LENGTH}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Например, Анна Смирнова"
              type="text"
              value={draftName}
            />
          </label>

          <div className="list-inline">
            <span>Текущее имя: {currentName}</span>
            <span>
              {normalizePersonClusterDisplayName(draftName).length}/
              {PERSON_CLUSTER_DISPLAY_NAME_MAX_LENGTH}
            </span>
          </div>

          <div className="actions">
            <button className="button" disabled={isSaving} onClick={handleSave} type="button">
              {isSaving ? "Сохраняем..." : "Сохранить имя"}
            </button>
            <button
              className="button-secondary"
              disabled={isSaving}
              onClick={handleCancel}
              type="button"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="panel-inline">
            <strong>{currentName}</strong>
            <span className="muted">
              Это основное человекочитаемое имя результата для текущей группы.
            </span>
          </div>

          <div className="actions">
            <button
              className="button-secondary"
              onClick={() => {
                setDraftName(currentName);
                setError(null);
                setSuccess(null);
                setIsEditing(true);
              }}
              type="button"
            >
              Переименовать
            </button>
          </div>
        </>
      )}

      {success ? <p className="notice success">{success}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}
    </section>
  );
}
