export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type JobPhase = "preprocessing" | "finalizing" | null;

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
  phase: JobPhase;
  progressPercent: number;
  totalPhotos: number;
  processedPhotos: number;
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
  sealedAt: string | null;
  registeredPhotos: number;
  jobId: string | null;
  jobStatus: JobStatus | null;
  jobPhase: JobPhase;
  totalPhotos: number;
  processedPhotos: number;
  progressPercent: number | null;
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
  phase: JobPhase;
  progressPercent: number;
  totalPhotos: number;
  processedPhotos: number;
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
  imageUrl: string | null;
  faces: DetectedFaceBox[];
}

export interface DetectedFaceBox {
  id: string;
  confidence: number | null;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
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
