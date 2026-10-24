import { authenticatedContext, handleOptions, jsonResponse, safeMetadata } from "../_shared/secure.ts";

const allowedEvents = new Set([
  "sign_in", "sign_out", "design_created", "design_updated",
  "design_published", "design_made_private", "design_deleted", "comment_submitted"
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return jsonResponse({ error: "Use POST." }, 405, origin);

  const ctx = await authenticatedContext(req);
  if (ctx.error || !ctx.user || !ctx.userClient || !ctx.adminClient) {
    return jsonResponse({ error: ctx.error || "Authentication failed." }, ctx.status, ctx.origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be JSON." }, 400, ctx.origin);
  }

  const eventType = body.eventType;
  if (typeof eventType !== "string" || !allowedEvents.has(eventType)) {
    return jsonResponse({ error: "Unsupported activity event." }, 400, ctx.origin);
  }

  let designId: string | null = null;
  if (body.designId !== undefined && body.designId !== null && body.designId !== "") {
    if (typeof body.designId !== "string" || !uuidPattern.test(body.designId)) {
      return jsonResponse({ error: "Invalid design ID." }, 400, ctx.origin);
    }
    designId = body.designId;
  }

  const ownerEvents = new Set([
    "design_created", "design_updated", "design_published",
    "design_made_private", "design_deleted"
  ]);
  if (ownerEvents.has(eventType)) {
    if (!designId) return jsonResponse({ error: "A design ID is required for this event." }, 400, ctx.origin);
    const { data, error } = await ctx.userClient
      .from("designs").select("id").eq("id", designId).maybeSingle();
    if (error || !data) {
      return jsonResponse({ error: "Design ownership could not be verified." }, 403, ctx.origin);
    }
  }

  if (eventType === "design_reported" || eventType === "comment_reported" || eventType === "comment_submitted") {
    if (!designId) return jsonResponse({ error: "A public design ID is required for this report event." }, 400, ctx.origin);
    const { data, error } = await ctx.adminClient
      .from("public_designs").select("id").eq("id", designId).maybeSingle();
    if (error || !data) return jsonResponse({ error: "Public design could not be verified." }, 404, ctx.origin);
  }

  // Whitelist only non-sensitive operational metadata. Never send emails, photo data,
  // full design JSON, prompt text, user-entered comments or raw request bodies to analytics.
  const metadata = safeMetadata(body.metadata);
  const { error } = await ctx.adminClient.from("activity_events").insert({
    user_id: ctx.user.id,
    event_type: eventType,
    design_id: designId,
    metadata
  });
  if (error) {
    console.error("Activity event insert failed:", error.message);
    return jsonResponse({ error: "Activity event could not be recorded." }, 500, ctx.origin);
  }
  return jsonResponse({ ok: true }, 200, ctx.origin);
});
