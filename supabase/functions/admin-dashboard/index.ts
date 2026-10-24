import { authenticatedContext, handleOptions, jsonResponse, requireAdmin } from "../_shared/secure.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return jsonResponse({ error: "Use POST." }, 405, origin);

  const ctx = await authenticatedContext(req);
  if (ctx.error || !ctx.user || !ctx.adminClient) {
    return jsonResponse({ error: ctx.error || "Authentication failed." }, ctx.status, ctx.origin);
  }

  const role = await requireAdmin(ctx.adminClient, ctx.user.id, ["admin"]);
  if (!role) return jsonResponse({ error: "Administrator access is required." }, 403, ctx.origin);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profileCount, designCount, publicCount, pendingCommentCount, openReportCount,
    events24h, activeUsers, recentEvents, pendingComments, reports, aiJobs
  ] = await Promise.all([
    ctx.adminClient.from("profiles").select("id", { count: "exact", head: true }),
    ctx.adminClient.from("designs").select("id", { count: "exact", head: true }),
    ctx.adminClient.from("public_designs").select("id", { count: "exact", head: true }),
    ctx.adminClient.from("design_comments").select("id", { count: "exact", head: true }).eq("moderation_status", "pending"),
    ctx.adminClient.from("content_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    ctx.adminClient.from("activity_events").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    ctx.adminClient.from("activity_events").select("user_id").gte("created_at", since7d).not("user_id", "is", null).limit(5000),
    ctx.adminClient.from("activity_events").select("id,user_id,event_type,design_id,metadata,created_at").order("created_at", { ascending: false }).limit(40),
    ctx.adminClient.from("design_comments").select("id,design_id,user_id,display_name,body,created_at").eq("moderation_status", "pending").order("created_at", { ascending: true }).limit(50),
    ctx.adminClient.from("content_reports").select("id,reporter_id,design_id,comment_id,reported_user_id,reason,details,created_at,status").eq("status", "open").order("created_at", { ascending: true }).limit(50),
    ctx.adminClient.from("ai_tryon_jobs").select("id", { count: "exact", head: true }).gte("created_at", since24h)
  ]);

  const failures = [profileCount, designCount, publicCount, pendingCommentCount, openReportCount, events24h, activeUsers, recentEvents, pendingComments, reports, aiJobs]
    .filter(item => item.error);
  if (failures.length) {
    console.error("Admin dashboard query failed:", failures.map(item => item.error?.message));
    return jsonResponse({ error: "Dashboard data could not be loaded. Confirm the latest schema is applied." }, 500, ctx.origin);
  }

  const activeIds = new Set((activeUsers.data || []).map(row => row.user_id).filter(Boolean));
  return jsonResponse({
    generatedAt: new Date().toISOString(),
    metrics: {
      accounts: profileCount.count || 0,
      savedDesigns: designCount.count || 0,
      publicDesigns: publicCount.count || 0,
      pendingComments: pendingCommentCount.count || 0,
      openReports: openReportCount.count || 0,
      events24h: events24h.count || 0,
      activeUsers7d: activeIds.size,
      aiTryOnRequests24h: aiJobs.count || 0,
      activeUserSampleCapped: (activeUsers.data || []).length >= 5000
    },
    pendingComments: pendingComments.data || [],
    openReports: reports.data || [],
    recentEvents: recentEvents.data || []
  }, 200, ctx.origin);
});
