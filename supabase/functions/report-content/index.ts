import { authenticatedContext, handleOptions, jsonResponse } from "../_shared/secure.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reasons = new Set(["copied_work", "harassment", "spam", "unsafe_content", "privacy", "other"]);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return jsonResponse({ error: "Use POST." }, 405, origin);

  const ctx = await authenticatedContext(req);
  if (ctx.error || !ctx.user || !ctx.userClient || !ctx.adminClient) {
    return jsonResponse({ error: ctx.error || "Authentication required." }, ctx.status, ctx.origin);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Request body must be JSON." }, 400, ctx.origin); }

  const targetType = body.targetType;
  const targetId = body.targetId;
  const reason = body.reason;
  const details = typeof body.details === "string"
    ? body.details.replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 800)
    : "";

  if ((targetType !== "design" && targetType !== "comment") ||
      typeof targetId !== "string" || !uuidPattern.test(targetId) ||
      typeof reason !== "string" || !reasons.has(reason)) {
    return jsonResponse({ error: "Choose a valid report target and reason." }, 400, ctx.origin);
  }

  const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: rateError } = await ctx.adminClient
    .from("content_reports").select("id", { count: "exact", head: true })
    .eq("reporter_id", ctx.user.id).gte("created_at", dayCutoff);
  if (rateError) return jsonResponse({ error: "Report rate could not be checked." }, 500, ctx.origin);
  if ((count || 0) >= 10) {
    return jsonResponse({ error: "You have reached the limit of 10 reports per 24 hours." }, 429, ctx.origin);
  }

  let designId: string | null = null;
  let commentId: string | null = null;
  if (targetType === "design") {
    const { data, error } = await ctx.adminClient.from("public_designs")
      .select("id").eq("id", targetId).maybeSingle();
    if (error || !data) return jsonResponse({ error: "That public design is no longer available." }, 404, ctx.origin);
    designId = data.id;
  } else {
    const { data, error } = await ctx.userClient.from("design_comments")
      .select("id,design_id").eq("id", targetId).eq("moderation_status", "visible").maybeSingle();
    if (error || !data) return jsonResponse({ error: "That public comment is no longer available." }, 404, ctx.origin);
    commentId = data.id;
    designId = data.design_id;
  }

  const { data: report, error: insertError } = await ctx.adminClient.from("content_reports").insert({
    reporter_id: ctx.user.id,
    design_id: targetType === "design" ? designId : null,
    comment_id: commentId,
    reason,
    details,
    status: "open"
  }).select("id").single();

  if (insertError || !report) {
    console.error("Content report could not be saved:", insertError?.message);
    return jsonResponse({ error: "Report could not be submitted. Please retry." }, 500, ctx.origin);
  }

  await ctx.adminClient.from("activity_events").insert({
    user_id: ctx.user.id,
    event_type: targetType === "design" ? "design_reported" : "comment_reported",
    design_id: designId,
    metadata: { reasonCategory: reason, source: "community" }
  });

  return jsonResponse({ ok: true, reportId: report.id, message: "Report received for moderation." }, 200, ctx.origin);
});
