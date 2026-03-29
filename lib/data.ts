import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  JobDetails,
  JobEvent,
  PersonDetails,
  RecentJob,
  UploadSummary,
  WorkspaceCluster,
  WorkspaceOverview,
  WorkspaceSummary
} from "@/lib/types";

async function getCurrentUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function createSignedUrl(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  bucket: "raw-photos" | "face-previews",
  path: string | null
): Promise<string | null> {
  if (!path) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function listWorkspacesForUser(): Promise<WorkspaceSummary[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspace_id, workspaces(id, name, slug, is_shared)")
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
        isShared: Boolean(workspace?.is_shared ?? false),
        role: String(entry.role ?? "member"),
        totalPhotos: totalPhotos ?? 0,
        clustersCount: clustersCount ?? 0,
        activeJobs: activeJobs ?? 0
      };
    })
  );

  return summaries.sort((left, right) => {
    if (left.isShared !== right.isShared) {
      return left.isShared ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "ru");
  });
}

export async function getWorkspaceOverview(
  workspaceId: string
): Promise<WorkspaceOverview | null> {
  const supabase = await createSupabaseServerClient();

  const [
    { data: workspace },
    { count: totalPhotos },
    { count: peopleCount },
    { data: jobs },
    { count: uploadCount },
    { data: clusters }
  ] = await Promise.all([
    supabase.from("workspaces").select("id, name, slug, is_shared").eq("id", workspaceId).single(),
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
      .eq("workspace_id", workspaceId),
    supabase
      .from("person_clusters")
      .select("id, display_name, preview_path, photo_count, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(6)
  ]);

  if (!workspace) {
    return null;
  }

  const recentJobs: RecentJob[] =
    jobs?.map((job: Record<string, unknown>) => ({
      id: String(job.id),
      status: String(job.status) as RecentJob["status"],
      progressPercent: Number(job.progress_percent ?? 0),
      createdAt: String(job.created_at),
      finishedAt: job.finished_at ? String(job.finished_at) : null
    })) ?? [];

  const recentClusters: WorkspaceCluster[] = await Promise.all(
    (clusters ?? []).map(async (cluster: Record<string, unknown>) => ({
      id: String(cluster.id),
      displayName: String(cluster.display_name ?? "Person"),
      previewPath: cluster.preview_path ? String(cluster.preview_path) : null,
      previewUrl: await createSignedUrl(
        supabase,
        "face-previews",
        cluster.preview_path ? String(cluster.preview_path) : null
      ),
      photoCount: Number(cluster.photo_count ?? 0),
      createdAt: String(cluster.created_at ?? new Date().toISOString())
    }))
  );

  return {
    id: String(workspace.id),
    name: String(workspace.name),
    slug: String(workspace.slug),
    isShared: Boolean(workspace.is_shared ?? false),
    totalPhotos: totalPhotos ?? 0,
    peopleCount: peopleCount ?? 0,
    uploadCount: uploadCount ?? 0,
    recentJobs,
    recentClusters
  };
}

export async function getJobDetails(
  workspaceId: string,
  jobId: string
): Promise<JobDetails | null> {
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

  if (!job) {
    return null;
  }

  return {
    id: String(job.id),
    status: String(job.status ?? "queued") as JobDetails["status"],
    progressPercent: Number(job.progress_percent ?? 0),
    errorMessage: job.error_message ? String(job.error_message) : null,
    startedAt: job.started_at ? String(job.started_at) : null,
    finishedAt: job.finished_at ? String(job.finished_at) : null,
    createdAt: String(job.created_at ?? new Date().toISOString()),
    uploadId: job.input_batch_id ? String(job.input_batch_id) : null,
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
): Promise<PersonDetails | null> {
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

  if (!person) {
    return null;
  }

  const photoIds =
    clusterLinks?.map((row: Record<string, unknown>) => String(row.photo_id)) ?? [];

  const { data: photos } =
    photoIds.length > 0
      ? await supabase.from("photos").select("id, storage_path").in("id", photoIds)
      : { data: [] as Record<string, unknown>[] };

  const previewPath = person.preview_path ? String(person.preview_path) : null;

  return {
    id: String(person.id),
    workspaceId: String(person.workspace_id ?? workspaceId),
    displayName: String(person.display_name ?? "Person"),
    previewPath,
    previewUrl: await createSignedUrl(supabase, "face-previews", previewPath),
    photoCount: Number(person.photo_count ?? 0),
    photos: await Promise.all(
      (photos ?? []).map(async (photo: Record<string, unknown>) => {
        const storagePath = String(photo.storage_path);

        return {
          id: String(photo.id),
          storagePath,
          signedUrl: await createSignedUrl(supabase, "raw-photos", storagePath)
        };
      })
    )
  };
}

export async function listUploadsForWorkspace(
  workspaceId: string
): Promise<UploadSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("photo_uploads")
    .select("id, name, status, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data) {
    return [];
  }

  return data.map((upload: Record<string, unknown>) => ({
    id: String(upload.id),
    name: String(upload.name ?? "Upload"),
    status: String(upload.status ?? "uploading") as UploadSummary["status"],
    createdAt: String(upload.created_at ?? new Date().toISOString())
  }));
}
