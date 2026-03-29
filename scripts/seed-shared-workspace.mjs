import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const SHARED_WORKSPACE_NAME = "TechCommunity Fest Demo";
const SHARED_WORKSPACE_SLUG = "techcommunity-fest-demo";
const SHARED_UPLOAD_NAME = "TechCommunity Fest Preloaded Photos";
const DEFAULT_SOURCE_DIR = "assets/images/tcf-msk";
const DEFAULT_SYSTEM_OWNER_EMAIL = "shared-workspace-bot@photo-sorter.local";
const DEFAULT_SYSTEM_OWNER_NAME = "Shared Workspace Bot";
const UPSERT_BATCH_SIZE = 50;
const USER_PAGE_SIZE = 200;

function requireEnv(key) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function sanitizeFileName(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, extension);
  const safeBaseName = baseName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeBaseName || "photo"}${extension}`;
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

async function listFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push(fullPath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function listAllUsers(supabase) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USER_PAGE_SIZE
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    users.push(...(data.users ?? []));

    if ((data.users ?? []).length < USER_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return users;
}

async function ensureSystemOwnerUser(supabase, users) {
  const systemOwnerEmail = (
    process.env.SHARED_WORKSPACE_SYSTEM_EMAIL ?? DEFAULT_SYSTEM_OWNER_EMAIL
  )
    .trim()
    .toLowerCase();

  const existingUser = users.find(
    (user) => (user.email ?? "").trim().toLowerCase() === systemOwnerEmail
  );

  if (existingUser) {
    return {
      owner: existingUser,
      users
    };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: systemOwnerEmail,
    email_confirm: true,
    user_metadata: {
      display_name: DEFAULT_SYSTEM_OWNER_NAME
    },
    app_metadata: {
      system: true,
      role: "shared_workspace_owner"
    }
  });

  if (error || !data.user) {
    throw new Error(
      `Failed to create shared workspace system owner: ${error?.message ?? "Unknown error"}`
    );
  }

  return {
    owner: data.user,
    users: [...users, data.user]
  };
}

async function ensureSharedWorkspace(supabase, ownerId) {
  const { data: existingWorkspace, error: selectError } = await supabase
    .from("workspaces")
    .select("id, name, slug, owner_id, is_shared")
    .eq("slug", SHARED_WORKSPACE_SLUG)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to lookup shared workspace: ${selectError.message}`);
  }

  if (existingWorkspace) {
    if (!existingWorkspace.is_shared) {
      const { data: updatedWorkspace, error: updateError } = await supabase
        .from("workspaces")
        .update({ is_shared: true })
        .eq("id", existingWorkspace.id)
        .select("id, name, slug, owner_id, is_shared")
        .single();

      if (updateError) {
        throw new Error(`Failed to mark workspace as shared: ${updateError.message}`);
      }

      return updatedWorkspace;
    }

    return existingWorkspace;
  }

  const { data: createdWorkspace, error: insertError } = await supabase
    .from("workspaces")
    .insert({
      name: SHARED_WORKSPACE_NAME,
      slug: SHARED_WORKSPACE_SLUG,
      owner_id: ownerId,
      is_shared: true
    })
    .select("id, name, slug, owner_id, is_shared")
    .single();

  if (insertError || !createdWorkspace) {
    throw new Error(`Failed to create shared workspace: ${insertError?.message ?? "Unknown error"}`);
  }

  return createdWorkspace;
}

async function ensureWorkspaceMemberships(supabase, workspaceId, ownerId, userIds) {
  const membershipRows = userIds.map((userId) => ({
    workspace_id: workspaceId,
    user_id: userId,
    role: userId === ownerId ? "owner" : "member"
  }));

  const { error } = await supabase
    .from("workspace_members")
    .upsert(membershipRows, {
      onConflict: "workspace_id,user_id"
    });

  if (error) {
    throw new Error(`Failed to sync workspace memberships: ${error.message}`);
  }
}

async function ensureUploadBatch(supabase, workspaceId, ownerId) {
  const { data: existingUploads, error: selectError } = await supabase
    .from("photo_uploads")
    .select("id, workspace_id, name, status")
    .eq("workspace_id", workspaceId)
    .eq("name", SHARED_UPLOAD_NAME)
    .order("created_at", { ascending: true })
    .limit(1);

  if (selectError) {
    throw new Error(`Failed to lookup shared upload batch: ${selectError.message}`);
  }

  const existingUpload = existingUploads?.[0];

  if (existingUpload) {
    if (existingUpload.status !== "uploaded") {
      const { data: updatedUpload, error: updateError } = await supabase
        .from("photo_uploads")
        .update({ status: "uploaded" })
        .eq("id", existingUpload.id)
        .select("id, workspace_id, name, status")
        .single();

      if (updateError) {
        throw new Error(`Failed to update shared upload batch: ${updateError.message}`);
      }

      return updatedUpload;
    }

    return existingUpload;
  }

  const { data: createdUpload, error: insertError } = await supabase
    .from("photo_uploads")
    .insert({
      workspace_id: workspaceId,
      name: SHARED_UPLOAD_NAME,
      status: "uploaded",
      uploaded_by: ownerId
    })
    .select("id, workspace_id, name, status")
    .single();

  if (insertError || !createdUpload) {
    throw new Error(`Failed to create shared upload batch: ${insertError?.message ?? "Unknown error"}`);
  }

  return createdUpload;
}

async function listExistingPhotoPaths(supabase, uploadId) {
  const existingPaths = new Set();
  let page = 0;

  while (true) {
    const from = page * 1000;
    const to = from + 999;
    const { data, error } = await supabase
      .from("photos")
      .select("storage_path")
      .eq("upload_id", uploadId)
      .range(from, to);

    if (error) {
      throw new Error(`Failed to list existing photos: ${error.message}`);
    }

    for (const row of data ?? []) {
      existingPaths.add(row.storage_path);
    }

    if (!data || data.length < 1000) {
      break;
    }

    page += 1;
  }

  return existingPaths;
}

async function upsertPhotos(supabase, rows) {
  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("photos")
    .upsert(rows, { onConflict: "storage_path" });

  if (error) {
    throw new Error(`Failed to upsert photos: ${error.message}`);
  }
}

async function main() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const sourceDirectory = path.resolve(
    process.cwd(),
    process.argv[2] ?? DEFAULT_SOURCE_DIR
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const files = await listFiles(sourceDirectory);

  if (files.length === 0) {
    throw new Error(`No files found in ${sourceDirectory}`);
  }

  const existingUsers = await listAllUsers(supabase);
  const { owner, users } = await ensureSystemOwnerUser(supabase, existingUsers);

  users.sort((left, right) => {
    const leftTimestamp = Date.parse(left.created_at ?? "");
    const rightTimestamp = Date.parse(right.created_at ?? "");
    return leftTimestamp - rightTimestamp;
  });

  const ownerId = owner.id;
  const workspace = await ensureSharedWorkspace(supabase, ownerId);
  await ensureWorkspaceMemberships(
    supabase,
    workspace.id,
    ownerId,
    users.map((user) => user.id)
  );

  const uploadBatch = await ensureUploadBatch(supabase, workspace.id, ownerId);
  const existingPaths = await listExistingPhotoPaths(supabase, uploadBatch.id);

  let uploadedCount = 0;
  let skippedCount = 0;
  let stagedRows = [];

  for (const [index, filePath] of files.entries()) {
    const storagePath = `${workspace.id}/${uploadBatch.id}/${String(index + 1).padStart(3, "0")}-${sanitizeFileName(path.basename(filePath))}`;

    if (existingPaths.has(storagePath)) {
      skippedCount += 1;
      continue;
    }

    const fileBuffer = await fs.readFile(filePath);
    const { error: uploadError } = await supabase.storage
      .from("raw-photos")
      .upload(storagePath, fileBuffer, {
        contentType: getContentType(filePath),
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload ${filePath}: ${uploadError.message}`);
    }

    stagedRows.push({
      workspace_id: workspace.id,
      upload_id: uploadBatch.id,
      storage_path: storagePath,
      checksum: createHash("sha256").update(fileBuffer).digest("hex"),
      uploaded_by: ownerId
    });
    uploadedCount += 1;

    if (stagedRows.length >= UPSERT_BATCH_SIZE) {
      await upsertPhotos(supabase, stagedRows);
      stagedRows = [];
    }
  }

  await upsertPhotos(supabase, stagedRows);

  const { error: uploadStatusError } = await supabase
    .from("photo_uploads")
    .update({ status: "uploaded" })
    .eq("id", uploadBatch.id);

  if (uploadStatusError) {
    throw new Error(`Failed to finalize upload batch: ${uploadStatusError.message}`);
  }

  console.log(
    JSON.stringify(
      {
        workspaceId: workspace.id,
        uploadId: uploadBatch.id,
        sourceDirectory,
        totalFiles: files.length,
        uploadedCount,
        skippedCount
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
