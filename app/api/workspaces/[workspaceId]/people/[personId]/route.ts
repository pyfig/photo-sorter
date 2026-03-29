import { NextRequest, NextResponse } from "next/server";

import { hasRequiredWebEnv } from "@/lib/env";
import {
  getPersonClusterDisplayNameError,
  normalizePersonClusterDisplayName
} from "@/lib/person-cluster-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface UpdatePersonBody {
  displayName?: unknown;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; personId: string }> }
) {
  if (!hasRequiredWebEnv()) {
    return NextResponse.json(
      { error: "Supabase env is not configured" },
      { status: 500 }
    );
  }

  const { workspaceId, personId } = await context.params;
  const body = (await request.json()) as UpdatePersonBody;

  if (typeof body.displayName !== "string") {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const validationError = getPersonClusterDisplayNameError(body.displayName);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const displayName = normalizePersonClusterDisplayName(body.displayName);
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: person, error: selectError } = await supabase
    .from("person_clusters")
    .select("id, workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("id", personId)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (!person) {
    return NextResponse.json({ error: "Person cluster not found" }, { status: 404 });
  }

  const { data: updatedPerson, error: updateError } = await supabase
    .from("person_clusters")
    .update({ display_name: displayName })
    .eq("workspace_id", workspaceId)
    .eq("id", personId)
    .select("id, workspace_id, display_name")
    .single();

  if (updateError || !updatedPerson) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to update person cluster" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    person: {
      id: String(updatedPerson.id),
      workspaceId: String(updatedPerson.workspace_id),
      displayName: String(updatedPerson.display_name ?? displayName)
    }
  });
}
