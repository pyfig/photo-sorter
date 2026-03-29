import { hasSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  JobDetails,
  JobEvent,
  PersonDetails,
  RecentJob,
  WorkspaceOverview,
  WorkspaceSummary
} from "@/lib/types";

const mockWorkspaceId = "00000000-0000-0000-0000-000000000001";
const mockJobId = "00000000-0000-0000-0000-000000000002";
const mockPersonId = "00000000-0000-0000-0000-000000000003";

function mockWorkspaces(): WorkspaceSummary[] {
  return [
    {
      id: mockWorkspaceId,
      name: "TechCommunity Fest Demo",
      slug: "techcommunity-fest-demo",
      role: "owner",
      totalPhotos: 682,
      activeJobs: 1,
      clustersCount: 24
    }
  ];
}

function mockWorkspaceOverview(workspaceId: string): WorkspaceOverview {
  return {
    id: workspaceId,
    name: "TechCommunity Fest Demo",
    slug: "techcommunity-fest-demo",
    totalPhotos: 682,
    peopleCount: 24,
    uploadCount: 1,
    recentJobs: [
      {
        id: mockJobId,
        status: "running",
        progressPercent: 54,
        createdAt: new Date().toISOString(),
        finishedAt: null
      }
    ]
  };
}

function mockJobDetails(jobId: string): JobDetails {
  const events: JobEvent[] = [
    {
      id: "evt-1",
      eventType: "job_created",
      payload: { message: "Job added to queue" },
      createdAt: new Date().toISOString()
    },
    {
      id: "evt-2",
      eventType: "faces_detected",
      payload: { processed_files: 341, detected_faces: 912 },
      createdAt: new Date().toISOString()
    }
  ];

  return {
    id: jobId,
    status: "running",
    progressPercent: 54,
    errorMessage: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    createdAt: new Date().toISOString(),
    uploadId: "upload-demo",
    events
  };
}

function mockPersonDetails(workspaceId: string, personId: string): PersonDetails {
  return {
    id: personId,
    workspaceId,
    displayName: "Person_001",
    previewPath: null,
    photoCount: 17,
    photos: [
      { id: "photo-1", storagePath: "raw-photos/demo/photo-001.jpg" },
      { id: "photo-2", storagePath: "raw-photos/demo/photo-010.jpg" }
    ]
  };
}

export async function listWorkspacesForUser(): Promise<WorkspaceSummary[]> {
  if (!hasSupabaseConfig()) {
    return mockWorkspaces();
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspace_id, workspaces(id, name, slug)")
    .eq("user_id", userId);

  if (error || !data) {
    return [];
  }

  const summaries = await Promise.all(
    data.map(async (entry: Record<string, unknown>) => {
      const workspace = entry.workspaces as Record<string, unknown> | null;
      const workspaceId = String(workspace?.id ?? entry.workspace_id ?? "");

      const [{ count: totalPhotos }, { count: clustersCount }, { count: activeJobs }] =
        await Promise.all([
          supabase
            .from("photos")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspaceId),
          supabase
            .from("person_clusters")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspaceId),
          supabase
            .from("processing_jobs")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .in("status", ["queued", "running"])
        ]);

      return {
        id: workspaceId,
        name: String(workspace?.name ?? "Workspace"),
        slug: String(workspace?.slug ?? "workspace"),
        role: String(entry.role ?? "member"),
        totalPhotos: totalPhotos ?? 0,
        clustersCount: clustersCount ?? 0,
        activeJobs: activeJobs ?? 0
      };
    })
  );

  return summaries;
}

export async function getWorkspaceOverview(
  workspaceId: string
): Promise<WorkspaceOverview> {
  if (!hasSupabaseConfig()) {
    return mockWorkspaceOverview(workspaceId);
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: workspace }, { count: totalPhotos }, { count: peopleCount }, { data: jobs }, { count: uploadCount }] =
    await Promise.all([
      supabase.from("workspaces").select("id, name, slug").eq("id", workspaceId).single(),
      supabase.from("photos").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase
        .from("person_clusters")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("processing_jobs")
        .select("id, status, progress_percent, created_at, finished_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("photo_uploads")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
    ]);

  const recentJobs: RecentJob[] =
    jobs?.map((job: Record<string, unknown>) => ({
      id: String(job.id),
      status: String(job.status) as RecentJob["status"],
      progressPercent: Number(job.progress_percent ?? 0),
      createdAt: String(job.created_at),
      finishedAt: job.finished_at ? String(job.finished_at) : null
    })) ?? [];

  return {
    id: String(workspace?.id ?? workspaceId),
    name: String(workspace?.name ?? "Workspace"),
    slug: String(workspace?.slug ?? "workspace"),
    totalPhotos: totalPhotos ?? 0,
    peopleCount: peopleCount ?? 0,
    uploadCount: uploadCount ?? 0,
    recentJobs
  };
}

export async function getJobDetails(
  workspaceId: string,
  jobId: string
): Promise<JobDetails> {
  if (!hasSupabaseConfig()) {
    return mockJobDetails(jobId);
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: job }, { data: events }] = await Promise.all([
    supabase
      .from("processing_jobs")
      .select(
        "id, status, progress_percent, error_message, started_at, finished_at, created_at, input_batch_id"
      )
      .eq("workspace_id", workspaceId)
      .eq("id", jobId)
      .single(),
    supabase
      .from("job_events")
      .select("id, event_type, payload, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  return {
    id: String(job?.id ?? jobId),
    status: String(job?.status ?? "queued") as JobDetails["status"],
    progressPercent: Number(job?.progress_percent ?? 0),
    errorMessage: job?.error_message ? String(job.error_message) : null,
    startedAt: job?.started_at ? String(job.started_at) : null,
    finishedAt: job?.finished_at ? String(job.finished_at) : null,
    createdAt: String(job?.created_at ?? new Date().toISOString()),
    uploadId: job?.input_batch_id ? String(job.input_batch_id) : null,
    events:
      events?.map((event: Record<string, unknown>) => ({
        id: String(event.id),
        eventType: String(event.event_type),
        payload: (event.payload as Record<string, unknown>) ?? {},
        createdAt: String(event.created_at)
      })) ?? []
  };
}

export async function getPersonDetails(
  workspaceId: string,
  personId: string
): Promise<PersonDetails> {
  if (!hasSupabaseConfig()) {
    return mockPersonDetails(workspaceId, personId);
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: person }, { data: clusterLinks }] = await Promise.all([
    supabase
      .from("person_clusters")
      .select("id, workspace_id, display_name, preview_path, photo_count")
      .eq("workspace_id", workspaceId)
      .eq("id", personId)
      .single(),
    supabase
      .from("cluster_photos")
      .select("photo_id")
      .eq("cluster_id", personId)
      .limit(50)
  ]);

  const photoIds =
    clusterLinks?.map((row: Record<string, unknown>) => String(row.photo_id)) ?? [];

  const { data: photos } =
    photoIds.length > 0
      ? await supabase.from("photos").select("id, storage_path").in("id", photoIds)
      : { data: [] as Record<string, unknown>[] };

  return {
    id: String(person?.id ?? mockPersonId),
    workspaceId: String(person?.workspace_id ?? workspaceId),
    displayName: String(person?.display_name ?? "Person_001"),
    previewPath: person?.preview_path ? String(person.preview_path) : null,
    photoCount: Number(person?.photo_count ?? 0),
    photos:
      photos?.map((photo: Record<string, unknown>) => ({
        id: String(photo.id),
        storagePath: String(photo.storage_path)
      })) ?? []
  };
}
