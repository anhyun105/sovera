import { authenticatedContext, handleOptions, jsonResponse, requireAdmin } from "../_shared/secure.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return jsonResponse({ error: "Use POST." }, 405, origin);

  const ctx = await authenticatedContext(req);
  if (ctx.error || !ctx.user || !ctx.adminClient) {
    return jsonResponse({ error: ctx.error || "Authentication failed." }, ctx.status, ctx.origin);
  }
  const role = await requireAdmin(ctx.adminClient, ctx.user.id, ["admin", "moderator"]);
  if (!role) return jsonResponse({ error: "Moderator access is required." }, 403, ctx.origin);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "Request body must be JSON." }, 400, ctx.origin); }

  const targetType = body.targetType;
  const targetId = body.targetId;
  const action = body.action;
  if ((targetType !== "comment" && targetType !== "report") ||
      typeof targetId !== "string" || !uuidPattern.test(targetId) ||
      typeof action !== "string") {
    return jsonResponse({ error: "Invalid moderation request." }, 400, ctx.origin);
  }

  let affectedDesignId: string | null = null;

  if (targetType === "comment") {
    if (!["approve", "hide", "delete"].includes(action)) {
      return jsonResponse({ error: "Use approve, hide or delete for a comment." }, 400, ctx.origin);
    }

    const { data: comment, error: readError } = await ctx.adminClient
      .from("design_comments").select("id,design_id").eq("id", targetId).maybeSingle();
    if (readError || !comment) return jsonResponse({ error: "Comment not found." }, 404, ctx.origin);
    affectedDesignId = comment.design_id;

    if (action === "delete") {
      const { error } = await ctx.adminClient.from("design_comments").delete().eq("id", targetId);
      if (error) return jsonResponse({ error: "Comment could not be deleted." }, 500, ctx.origin);
    } else {
      const status = action === "approve" ? "visible" : "hidden";
      const { error } = await ctx.adminClient.from("design_comments")
        .update({ moderation_status: status }).eq("id", targetId);
      if (error) return jsonResponse({ error: "Comment status could not be updated." }, 500, ctx.origin);
    }

    await ctx.adminClient.from("activity_events").insert({
      user_id: ctx.user.id,
      event_type: "comment_moderated",
      design_id: affectedDesignId,
      metadata: { action, source: "admin" }
    });
    return jsonResponse({ ok: true, message: "Comment moderation action completed." }, 200, ctx.origin);
  }

  if (!["dismiss", "resolve", "take_down", "suspend_7d"].includes(action)) {
    return jsonResponse({ error: "Use dismiss, resolve, take_down or suspend_7d for a report." }, 400, ctx.origin);
  }

  const { data: report, error: reportError } = await ctx.adminClient
    .from("content_reports")
    .select("id,design_id,comment_id,reported_user_id,status")
    .eq("id", targetId).maybeSingle();
  if (reportError || !report) return jsonResponse({ error: "Report not found." }, 404, ctx.origin);
  affectedDesignId = report.design_id;

  if (action === "suspend_7d") {
    if (role !== "admin") return jsonResponse({ error: "Only an administrator can suspend an account." }, 403, ctx.origin);
    if (!report.reported_user_id) return jsonResponse({ error: "This report is not for a creator account." }, 400, ctx.origin);
    if (report.reported_user_id === ctx.user.id) return jsonResponse({ error: "You cannot suspend your own account through a report." }, 400, ctx.origin);
    const { data: targetRole, error: roleError } = await ctx.adminClient
      .from("admin_roles").select("role").eq("user_id", report.reported_user_id).maybeSingle();
    if (roleError) return jsonResponse({ error: "Target account role could not be checked." }, 500, ctx.origin);
    if (targetRole) return jsonResponse({ error: "Moderator/admin accounts require a separate owner review." }, 403, ctx.origin);
    const { error: banError } = await ctx.adminClient.auth.admin.updateUserById(report.reported_user_id, {
      ban_duration: "168h"
    });
    if (banError) return jsonResponse({ error: "The account could not be suspended." }, 500, ctx.origin);
  }

  if (action === "take_down") {
    if (report.design_id) {
      const { data: publicDesign } = await ctx.adminClient.from("public_designs")
        .select("id,preview_image_path").eq("id", report.design_id).maybeSingle();

      const { error: privacyError } = await ctx.adminClient.from("designs")
        .update({ visibility: "private" }).eq("id", report.design_id);
      if (privacyError) return jsonResponse({ error: "The reported design could not be made private." }, 500, ctx.origin);

      if (publicDesign?.preview_image_path) {
        const { error: storageError } = await ctx.adminClient.storage
          .from("public-design-previews").remove([publicDesign.preview_image_path]);
        if (storageError) console.warn("Public preview cleanup pending:", storageError.message);
      }
    } else if (report.comment_id) {
      const { error: commentError } = await ctx.adminClient.from("design_comments")
        .update({ moderation_status: "hidden" }).eq("id", report.comment_id);
      if (commentError) return jsonResponse({ error: "The reported comment could not be hidden." }, 500, ctx.origin);
    }
  }

  const nextStatus = action === "dismiss" ? "dismissed" : "reviewed";
  const { error: updateReportError } = await ctx.adminClient.from("content_reports").update({
    status: nextStatus,
    resolved_by: ctx.user.id,
    resolved_at: new Date().toISOString()
  }).eq("id", targetId);
  if (updateReportError) return jsonResponse({ error: "Report status could not be updated." }, 500, ctx.origin);

  await ctx.adminClient.from("activity_events").insert({
    user_id: ctx.user.id,
    event_type: report.reported_user_id ? (action === "suspend_7d" ? "user_banned" : "user_reported") : report.comment_id ? "comment_moderated" : "design_made_private",
    design_id: affectedDesignId,
    metadata: { action, source: "admin" }
  });

  return jsonResponse({ ok: true, message: "Report moderation action completed." }, 200, ctx.origin);
});
