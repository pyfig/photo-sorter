import { NextResponse } from "next/server";

import { hasRequiredWebEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getContentType(path: string, blobType: string | null): string {
  if (blobType) {
    return blobType;
  }

  const normalizedPath = path.toLowerCase();

  if (normalizedPath.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedPath.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; personId: string; photoId: string }> }
) {
  if (!hasRequiredWebEnv()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  const { workspaceId, personId, photoId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: person } = await supabase
    .from("person_clusters")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", personId)
    .single();

  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  const { data: clusterPhoto } = await supabase
    .from("cluster_photos")
    .select("photo_id")
    .eq("cluster_id", personId)
    .eq("photo_id", photoId)
    .single();

  if (!clusterPhoto) {
    return NextResponse.json({ error: "Photo not linked to person" }, { status: 404 });
  }

  const { data: photo } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("workspace_id", workspaceId)
    .eq("id", photoId)
    .single();

  if (!photo?.storage_path) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const { data: blob, error } = await supabase.storage
    .from("raw-photos")
    .download(String(photo.storage_path));

  if (error || !blob) {
    return NextResponse.json(
      { error: error?.message ?? "Photo download failed" },
      { status: 502 }
    );
  }

  return new NextResponse(blob, {
    headers: {
      "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": getContentType(String(photo.storage_path), blob.type || null),
      Vary: "Cookie"
    }
  });
}
