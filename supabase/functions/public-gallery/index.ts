import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://anhyun105.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
]);

function respond(body: unknown, status: number, origin: string, cacheable = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheable ? "public, max-age=20" : "no-store",
      "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "null",
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (!allowedOrigins.has(origin)) return respond({ error: "Origin not allowed." }, 403, origin);
  if (req.method === "OPTIONS") return respond({ ok: true }, 200, origin);
  if (req.method !== "POST") return respond({ error: "Use POST." }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("SOVERA_SUPABASE_URL");
  const secretKeys = (() => {
    try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); }
    catch { return {}; }
  })();
  const serviceKey = secretKeys.default ||
    Deno.env.get("SOVERA_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceKey) {
    return respond({ error: "The public gallery backend is not configured yet." }, 503, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
  } catch {
    // Empty request bodies are fine; the endpoint uses a bounded default limit.
  }

  const rawLimit = Number(body.limit ?? 30);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(30, Math.floor(rawLimit))) : 30;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await admin
    .from("public_designs")
    .select("id,title,caption,garment_type,display_color,like_count,published_at,creator_name,preview_image_path")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Public gallery query failed:", error.message);
    return respond({ error: "The public gallery is temporarily unavailable." }, 500, origin);
  }

  const designs = [];
  for (const row of (data || [])) {
    // Paths must belong to this public design. Never sign arbitrary file paths from a caller.
    if (typeof row.preview_image_path !== "string" ||
        !row.preview_image_path.startsWith(row.id + "/") ||
        row.preview_image_path.includes("..") ||
        row.preview_image_path.startsWith("/")) {
      console.warn("Skipped an invalid public preview path for design:", row.id);
      continue;
    }

    const { data: signed, error: signedError } = await admin.storage
      .from("public-design-previews")
      .createSignedUrl(row.preview_image_path, 300);

    if (signedError || !signed?.signedUrl) {
      console.warn("Could not sign public preview:", row.id, signedError?.message);
      continue;
    }

    designs.push({
      id: row.id,
      title: row.title,
      caption: row.caption,
      garment_type: row.garment_type,
      display_color: row.display_color,
      like_count: Number(row.like_count || 0),
      published_at: row.published_at,
      creator_name: row.creator_name || "Sovera creator",
      previewUrl: signed.signedUrl
    });
  }

  return respond({ designs, generatedAt: new Date().toISOString(), urlExpirySeconds: 300 }, 200, origin, true);
});
