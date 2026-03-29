import type { JobDetails, JobEvent } from "@/lib/types";
import { shortId } from "@/lib/utils";

function formatPayloadValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return "есть дополнительные данные";
}

function formatMetric(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }

  return "0";
}

export function formatSeconds(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return `${value} сек.`;
}

export function getJobCopy(job: JobDetails) {
  switch (job.status) {
    case "queued":
      return {
        title: "Обработка запланирована",
        description: `Фотографии уже приняты. Обработка #${shortId(job.id)} ждёт своей очереди и скоро начнётся.`,
        summary: "Сервис поставил задачу в очередь. Следующий шаг: начнётся разбор фотографий."
      };
    case "running":
      if (job.phase === "finalizing") {
        return {
          title: "Идёт финальная сборка результата",
          description: `Сервис завершает группировку лиц и собирает итог по обработке #${shortId(job.id)}.`,
          summary: "Предварительная обработка уже закончилась. Сейчас сервис объединяет найденные лица в итоговые группы."
        };
      }

      return {
        title: "Идёт обработка фотографий",
        description: `Сервис анализирует снимки по мере загрузки и готовит материал для обработки #${shortId(job.id)}.`,
        summary: "Сейчас сервис читает фотографии, находит лица и подготавливает итоговую кластеризацию."
      };
    case "completed":
      return {
        title: "Результат готов",
        description: `Обработка #${shortId(job.id)} завершена. Можно вернуться в проект и открыть найденные результаты.`,
        summary: "Все шаги завершены. Теперь в проекте доступны готовые группы людей."
      };
    case "failed":
      return {
        title: "Обработка завершилась с ошибкой",
        description: `Обработка #${shortId(job.id)} остановилась раньше времени. Ниже видно, на каком шаге это произошло.`,
        summary: "Нужна проверка ошибки и повторный запуск загрузки или обработки."
      };
    default:
      return {
        title: "Обработка остановлена",
        description: `Обработка #${shortId(job.id)} была остановлена до завершения.`,
        summary: "Автоматическое движение дальше не происходит. Если нужно, запустите новую обработку."
      };
  }
}

export function describeJobEvent(event: JobEvent) {
  switch (event.eventType) {
    case "job_created":
      return {
        title: "Обработка создана",
        description: "Сервис открыл upload-level pipeline и начал принимать фотографии в обработку.",
        details:
          typeof event.payload.upload_id === "string"
            ? `Связана с загрузкой #${shortId(event.payload.upload_id)}.`
            : null
      };
    case "photo_registered":
      return {
        title: "Фото поставлено в preprocessing",
        description: "Файл успешно загружен и сразу поставлен в очередь предварительной обработки.",
        details:
          typeof event.payload.storage_path === "string"
            ? `Файл: ${event.payload.storage_path}.`
            : null
      };
    case "photo_preprocessing_started":
      return {
        title: "Старт обработки одного фото",
        description: "Worker взял следующее фото и начал извлекать лица и embeddings.",
        details:
          typeof event.payload.photo_id === "string"
            ? `Фото #${shortId(event.payload.photo_id)}.`
            : null
      };
    case "photo_preprocessing_completed":
      return {
        title: "Фото подготовлено",
        description: `Из фото извлечено ${formatMetric(event.payload.detected_faces)} лиц для следующего этапа.`,
        details:
          typeof event.payload.photo_id === "string"
            ? `Фото #${shortId(event.payload.photo_id)} завершено.`
            : null
      };
    case "photo_preprocessing_failed":
      return {
        title: "Одно фото не удалось подготовить",
        description: "Сервис пропустил проблемный файл и продолжил работу с остальными.",
        details:
          typeof event.payload.storage_path === "string"
            ? `Файл: ${event.payload.storage_path}.`
            : null
      };
    case "upload_sealed":
      return {
        title: "Загрузка закрыта",
        description: "Новые файлы для этой подборки больше не ожидаются.",
        details: null
      };
    case "job_finalization_started":
      return {
        title: "Финальная кластеризация началась",
        description: "Сервис собрал все подготовленные лица и начал итоговую группировку.",
        details: null
      };
    case "job_started":
      return {
        title: "Обработка началась",
        description: `В работу взято ${formatMetric(event.payload.photo_count)} фото.`,
        details: null
      };
    case "faces_detected":
      return {
        title: "Лица найдены",
        description: `Сервис обнаружил ${formatMetric(event.payload.detected_faces)} лиц на загруженных фотографиях.`,
        details: null
      };
    case "faces_clustered":
      return {
        title: "Фотографии сгруппированы",
        description: `Подготовлено ${formatMetric(event.payload.clustered_faces)} распознанных лиц для группировки.`,
        details:
          event.payload.detected_faces !== undefined
            ? `Всего найдено лиц: ${formatMetric(event.payload.detected_faces)}.`
            : null
      };
    case "job_completed":
      return {
        title: "Обработка завершена",
        description: `Готово ${formatMetric(event.payload.clusters)} групп людей.`,
        details: null
      };
    case "job_finished_without_faces":
      return {
        title: "Лица не обнаружены",
        description: "Обработка завершилась без найденных лиц.",
        details:
          event.payload.photo_count !== undefined
            ? `Проверено фотографий: ${formatMetric(event.payload.photo_count)}.`
            : null
      };
    case "photo_failed":
      return {
        title: "Одно фото не удалось обработать",
        description: "Сервис пропустил проблемный файл и продолжил работу с остальными.",
        details:
          typeof event.payload.storage_path === "string"
            ? `Файл: ${event.payload.storage_path}.`
            : null
      };
    case "job_failed":
      return {
        title: "Обработка остановилась с ошибкой",
        description:
          typeof event.payload.message === "string"
            ? event.payload.message
            : "Во время обработки произошла ошибка.",
        details: null
      };
    default: {
      const payloadSummary = Object.entries(event.payload)
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${formatPayloadValue(value)}`)
        .join(" • ");

      return {
        title: event.eventType,
        description: payloadSummary || "Сервис записал дополнительное техническое событие.",
        details: null
      };
    }
  }
}
