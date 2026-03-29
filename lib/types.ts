export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  isShared: boolean;
  role: string;
  totalPhotos: number;
  activeJobs: number;
  clustersCount: number;
}

export interface RecentJob {
  id: string;
  status: JobStatus;
  progressPercent: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface WorkspaceOverview {
  id: string;
  name: string;
  slug: string;
  isShared: boolean;
  totalPhotos: number;
  peopleCount: number;
  uploadCount: number;
  recentJobs: RecentJob[];
  recentClusters: WorkspaceCluster[];
}

export interface WorkspaceCluster {
  id: string;
  displayName: string;
  previewPath: string | null;
  previewUrl: string | null;
  photoCount: number;
  createdAt: string;
}

export interface UploadSummary {
  id: string;
  name: string;
  status: "uploading" | "uploaded" | "failed";
  createdAt: string;
}

export interface JobEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface JobDetails {
  id: string;
  status: JobStatus;
  progressPercent: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  uploadId: string | null;
  events: JobEvent[];
}

export interface PersonPhoto {
  id: string;
  storagePath: string;
  signedUrl: string | null;
}

export interface PersonDetails {
  id: string;
  workspaceId: string;
  displayName: string;
  previewPath: string | null;
  previewUrl: string | null;
  photoCount: number;
  photos: PersonPhoto[];
}
