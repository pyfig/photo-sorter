export const PERSON_CLUSTER_DISPLAY_NAME_MAX_LENGTH = 80;

export function normalizePersonClusterDisplayName(value: string): string {
  return value.trim();
}

export function getPersonClusterDisplayNameError(value: string): string | null {
  const normalized = normalizePersonClusterDisplayName(value);

  if (!normalized) {
    return "Имя группы не может быть пустым.";
  }

  if (normalized.length > PERSON_CLUSTER_DISPLAY_NAME_MAX_LENGTH) {
    return `Имя группы должно быть не длиннее ${PERSON_CLUSTER_DISPLAY_NAME_MAX_LENGTH} символов.`;
  }

  return null;
}
