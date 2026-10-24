import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://anhyun105.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
]);

function respond(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "null",
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  });
}

async function listAllObjectPaths(
  admin: any,
  bucket: string,
  prefix: string,
  maxFiles: number
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (error) throw new Error("Storage inventory failed for " + bucket + ": " + error.message);
    if (!data?.length) break;

    for (const item of data) {
      if (item.name === ".emptyFolderPlaceholder") continue;
      const itemPath = prefix ? prefix + "/" + item.name : item.name;
      if (item.id === null) {
        files.push(...await listAllObjectPaths(admin, bucket, itemPath, maxFiles - files.length));
      } else {
        files.push(itemPath);
      }
      if (files.length > maxFiles) throw new Error("Account data exceeds the safe automated deletion limit. Contact Sovera support.");
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return files;
}

async function removePaths(admin: any, bucket: string, paths: string[]) {
  for (let offset = 0; offset < paths.length; offset += 100) {
    const chunk = paths.slice(offset, offset + 100);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw new Error("Could not clean up " + bucket + " files: " + error.message);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (!allowedOrigins.has(origin)) return respond({ error: "Origin not allowed." }, 403, origin);
  if (req.method === "OPTIONS") return respond({ ok: true }, 200, origin);
  if (req.method !== "POST") return respond({ error: "Use POST." }, 405, origin);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return respond({ error: "Sign in is required." }, 401, origin);

  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("SOVERA_SUPABASE_URL");
  const publishable = Deno.env.get("SOVERA_SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  const secretKeys = (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); } catch { return {}; } })();
  const service = secretKeys.default || Deno.env.get("SOVERA_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !service) return respond({ error: "Account deletion is not configured on the server." }, 503, origin);

  const userClient = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;
  if (authError || !user) return respond({ error: "Your session is invalid. Please sign in again." }, 401, origin);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return respond({ error: "Request body must be JSON." }, 400, origin); }
  if (body.confirmation !== "DELETE MY SOVERA ACCOUNT") {
    return respond({ error: 'For safety, submit confirmation text "DELETE MY SOVERA ACCOUNT".' }, 400, origin);
  }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: designs, error: designsError } = await admin
      .from("designs").select("id").eq("user_id", user.id).limit(1000);
    if (designsError) throw new Error("Could not inventory your designs.");
    if ((designs || []).length >= 1000) throw new Error("This account contains too many designs for automated deletion. Contact support.");

    // Remove original uploads and try-on photos before deleting database/auth rows.
    const assetFiles = await listAllObjectPaths(admin, "design-assets", user.id, 5000);
    const previewFiles: string[] = [];
    for (const design of (designs || [])) {
      previewFiles.push(...await listAllObjectPaths(admin, "public-design-previews", design.id, 100));
      if (previewFiles.length > 10000) throw new Error("Too many public previews to remove safely. Contact support.");
    }
    await removePaths(admin, "design-assets", assetFiles);
    await removePaths(admin, "public-design-previews", previewFiles);

    await admin.from("activity_events").insert({
      user_id: null,
      event_type: "user_deleted",
      metadata: { source: "self_service_account_deletion" }
    });

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error("Account records could not be deleted after file cleanup. Contact support.");
    return respond({ ok: true, message: "Your Sovera account and associated files have been deleted." }, 200, origin);
  } catch (error) {
    console.error("Sovera account deletion failed:", error instanceof Error ? error.message : "Unknown error");
    return respond({ error: error instanceof Error ? error.message : "Account deletion failed safely." }, 500, origin);
  }
});
