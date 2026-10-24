import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://anhyun105.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
]);

function parseObject(value: string | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function isAllowedOrigin(origin: string) {
  return allowedOrigins.has(origin);
}

export function jsonResponse(body: unknown, status: number, origin: string) {
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

export function handleOptions(req: Request) {
  const origin = req.headers.get("Origin") || "";
  if (!isAllowedOrigin(origin)) return jsonResponse({ error: "Origin not allowed." }, 403, origin);
  return jsonResponse({ ok: true }, 200, origin);
}

export async function authenticatedContext(req: Request) {
  const origin = req.headers.get("Origin") || "";
  if (!isAllowedOrigin(origin)) {
    return { error: "Origin not allowed.", status: 403, origin, user: null, userClient: null, adminClient: null };
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return { error: "Sign in is required.", status: 401, origin, user: null, userClient: null, adminClient: null };
  }

  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("SOVERA_SUPABASE_URL");
  const publishableKeys = parseObject(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"));
  const publishableKey = publishableKeys.default || Deno.env.get("SOVERA_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  const secretKeys = parseObject(Deno.env.get("SUPABASE_SECRET_KEYS"));
  const secretKey = secretKeys.default || Deno.env.get("SOVERA_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) {
    return { error: "Supabase server keys are not configured.", status: 503, origin, user: null, userClient: null, adminClient: null };
  }

  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return { error: "Your session is invalid. Please sign in again.", status: 401, origin, user: null, userClient: null, adminClient: null };
  }

  const adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return { error: null, status: 200, origin, user: data.user, userClient, adminClient };
}

export function safeMetadata(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const allowed = new Set(["source", "garmentType", "visibility", "material", "reasonCategory", "action"]);
  const result: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) continue;
    const value = source[key];
    if (typeof value === "string") result[key] = value.replace(/[<>\u0000-\u001f]/g, " ").slice(0, 80);
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

export async function requireAdmin(adminClient: SupabaseClient<any, "public", "public", any, any>, userId: string, roles = ["admin"]) {
  const { data, error } = await adminClient.from("admin_roles").select("role").eq("user_id", userId).maybeSingle();
  const roleValue = (data as unknown as { role?: string } | null)?.role;
  if (error || !roleValue || !roles.includes(roleValue)) return null;
  return roleValue;
}

/**
 * Fail-closed owner-only gate for privileged Sovera controls.
 * The Supabase project's trusted secrets must set SOVERA_OWNER_USER_ID to
 * the owner's verified Auth UUID. The database admin role is also required.
 * A second user with a mistakenly granted admin role is still blocked unless
 * their UUID matches the server-side owner lock.
 */
export async function requireOwner(
  adminClient: SupabaseClient<any, "public", "public", any, any>,
  userId: string
) {
  const ownerId = (Deno.env.get("SOVERA_OWNER_USER_ID") || "").trim();
  if (!ownerId || userId !== ownerId) return null;
  return await requireAdmin(adminClient, userId, ["admin"]);
}
