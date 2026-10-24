import { authenticatedContext, handleOptions, jsonResponse, requireAdmin } from "../_shared/secure.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25;
const SEARCH_PAGE_SIZE = 1000;
const MAX_SEARCH_PAGES = 10;

function cleanQuery(value: unknown) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120).toLowerCase() : "";
}

function accountStatus(user: Record<string, unknown>) {
  if (user.is_anonymous === true) return "anonymous";
  const bannedUntil = typeof user.banned_until === "string" ? Date.parse(user.banned_until) : 0;
  if (bannedUntil > Date.now()) return "suspended";
  if (typeof user.email_confirmed_at === "string" && user.email_confirmed_at) return "confirmed";
  return "unverified";
}

async function getSummaryRows(adminClient: any, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await adminClient.rpc("admin_user_summaries", { p_user_ids: ids });
  if (error) throw new Error("Could not load user record summaries. Apply the latest Sovera database migration.");
  return data || [];
}

function combineUser(user: Record<string, any>, summary: Record<string, any> | undefined, role: string | null) {
  return {
    id: user.id,
    email: user.email || "",
    displayName: summary?.display_name || user.user_metadata?.display_name || user.user_metadata?.full_name || "Sovera creator",
    handle: summary?.handle || "",
    role,
    status: accountStatus(user),
    emailConfirmedAt: user.email_confirmed_at || null,
    createdAt: user.created_at || null,
    lastSignInAt: user.last_sign_in_at || null,
    bannedUntil: user.banned_until || null,
    isAnonymous: user.is_anonymous === true,
    designCount: Number(summary?.design_count || 0),
    publicDesignCount: Number(summary?.public_design_count || 0),
    commentCount: Number(summary?.comment_count || 0),
    likeCount: Number(summary?.like_count || 0),
    activityCount: Number(summary?.activity_count || 0),
    lastActivityAt: summary?.last_activity_at || null,
    lastActivityType: summary?.last_activity_type || null
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return jsonResponse({ error: "Use POST." }, 405, origin);

  const ctx = await authenticatedContext(req);
  if (ctx.error || !ctx.user || !ctx.adminClient) {
    return jsonResponse({ error: ctx.error || "Authentication failed." }, ctx.status, ctx.origin);
  }

  const role = await requireAdmin(ctx.adminClient, ctx.user.id, ["admin"]);
  if (!role) return jsonResponse({ error: "Only the Sovera account owner/admin can view user records." }, 403, ctx.origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be JSON." }, 400, ctx.origin);
  }

  const action = typeof body.action === "string" ? body.action : "list";

  if (action === "suspend_7d" || action === "lift_suspension") {
    const targetId = body.userId;
    if (typeof targetId !== "string" || !uuidPattern.test(targetId)) {
      return jsonResponse({ error: "A valid account ID is required." }, 400, ctx.origin);
    }
    if (targetId === ctx.user.id) {
      return jsonResponse({ error: "You cannot suspend or un-suspend your own admin account here." }, 400, ctx.origin);
    }

    const { data: targetRole, error: roleError } = await ctx.adminClient
      .from("admin_roles").select("role").eq("user_id", targetId).maybeSingle();
    if (roleError) return jsonResponse({ error: "Target account role could not be checked." }, 500, ctx.origin);
    if (targetRole) return jsonResponse({ error: "Admin/moderator accounts are protected from this control." }, 403, ctx.origin);

    const { data: targetResult, error: targetError } = await ctx.adminClient.auth.admin.getUserById(targetId);
    if (targetError || !targetResult?.user) return jsonResponse({ error: "Account was not found." }, 404, ctx.origin);

    const { error } = await ctx.adminClient.auth.admin.updateUserById(targetId, {
      ban_duration: action === "suspend_7d" ? "168h" : "none"
    });
    if (error) return jsonResponse({ error: "Account status could not be changed." }, 500, ctx.origin);

    const eventType = action === "suspend_7d" ? "user_banned" : "user_unbanned";
    const { error: eventError } = await ctx.adminClient.from("activity_events").insert({
      user_id: ctx.user.id,
      event_type: eventType,
      metadata: { action, targetUserId: targetId, source: "admin_dashboard" }
    });
    if (eventError) console.warn("Admin action succeeded but activity event could not be saved:", eventError.message);

    return jsonResponse({
      ok: true,
      message: action === "suspend_7d" ? "Account suspended for 7 days." : "Account sign-in suspension lifted."
    }, 200, ctx.origin);
  }

  if (action === "detail") {
    const targetId = body.userId;
    if (typeof targetId !== "string" || !uuidPattern.test(targetId)) {
      return jsonResponse({ error: "A valid account ID is required." }, 400, ctx.origin);
    }

    const [authResult, designsResult, commentsResult, activityResult, summaries] = await Promise.all([
      ctx.adminClient.auth.admin.getUserById(targetId),
      ctx.adminClient.from("designs")
        .select("id,title,garment_type,visibility,created_at,updated_at")
        .eq("user_id", targetId).order("updated_at", { ascending: false }).limit(100),
      ctx.adminClient.from("design_comments")
        .select("id,design_id,body,moderation_status,created_at")
        .eq("user_id", targetId).order("created_at", { ascending: false }).limit(50),
      ctx.adminClient.from("activity_events")
        .select("id,event_type,design_id,metadata,created_at")
        .eq("user_id", targetId).order("created_at", { ascending: false }).limit(100),
      getSummaryRows(ctx.adminClient, [targetId])
    ]);

    if (authResult.error || !authResult.data?.user) return jsonResponse({ error: "Account was not found." }, 404, ctx.origin);
    const failedQuery = [designsResult, commentsResult, activityResult].find((result) => result.error);
    if (failedQuery?.error) return jsonResponse({ error: "The account record could not be loaded." }, 500, ctx.origin);

    const { data: roleRow, error: detailRoleError } = await ctx.adminClient
      .from("admin_roles").select("role").eq("user_id", targetId).maybeSingle();
    if (detailRoleError) return jsonResponse({ error: "Account role could not be loaded." }, 500, ctx.origin);

    const summary = summaries[0];
    return jsonResponse({
      user: combineUser(authResult.data.user as unknown as Record<string, any>, summary, roleRow?.role || null),
      designs: designsResult.data || [],
      comments: commentsResult.data || [],
      activity: activityResult.data || [],
      note: "This record deliberately excludes passwords, session tokens, original photos, private Storage paths and raw design measurements."
    }, 200, ctx.origin);
  }

  if (action !== "list") return jsonResponse({ error: "Unsupported admin-user action." }, 400, ctx.origin);

  const page = Math.max(1, Math.min(100000, Number.isInteger(Number(body.page)) ? Number(body.page) : 1));
  const query = cleanQuery(body.query);
  let users: Record<string, any>[] = [];
  let hasNextPage = false;
  let totalMatches: number | null = null;
  let searchLimited = false;

  if (query) {
    const pages = await Promise.all(Array.from({ length: MAX_SEARCH_PAGES }, (_, index) =>
      ctx.adminClient.auth.admin.listUsers({ page: index + 1, perPage: SEARCH_PAGE_SIZE })
    ));
    const failure = pages.find((result) => result.error);
    if (failure?.error) return jsonResponse({ error: "Could not search registered accounts." }, 500, ctx.origin);

    const scanned = pages.flatMap((result) => result.data?.users || []);
    searchLimited = pages.every((result) => (result.data?.users || []).length >= SEARCH_PAGE_SIZE);
    const matches = scanned.filter((user) => {
      const metadata = user.user_metadata || {};
      const terms = [user.id, user.email, metadata.display_name, metadata.full_name, metadata.name]
        .filter((item) => typeof item === "string").map((item) => item.toLowerCase());
      return terms.some((item) => item.includes(query));
    });
    totalMatches = matches.length;
    const start = (page - 1) * PAGE_SIZE;
    users = matches.slice(start, start + PAGE_SIZE);
    hasNextPage = start + PAGE_SIZE < matches.length;
  } else {
    const { data, error } = await ctx.adminClient.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) return jsonResponse({ error: "Could not load registered accounts." }, 500, ctx.origin);
    users = data.users || [];
    hasNextPage = users.length === PAGE_SIZE;
  }

  let summaries: Record<string, any>[] = [];
  let roles: Record<string, any>[] = [];
  if (users.length) {
    try {
      summaries = await getSummaryRows(ctx.adminClient, users.map((user) => user.id));
    } catch (error) {
      console.error("User summary failed:", error);
      return jsonResponse({ error: error instanceof Error ? error.message : "Could not load user records." }, 500, ctx.origin);
    }
    const { data, error } = await ctx.adminClient.from("admin_roles")
      .select("user_id,role").in("user_id", users.map((user) => user.id));
    if (error) return jsonResponse({ error: "Account roles could not be loaded." }, 500, ctx.origin);
    roles = data || [];
  }

  const summaryMap = new Map(summaries.map((item) => [item.user_id, item]));
  const roleMap = new Map(roles.map((item) => [item.user_id, item.role]));
  const resultUsers = users.map((user) => combineUser(user, summaryMap.get(user.id), roleMap.get(user.id) || null));

  return jsonResponse({
    page,
    pageSize: PAGE_SIZE,
    query,
    users: resultUsers,
    hasPreviousPage: page > 1,
    hasNextPage,
    totalMatches,
    searchLimited,
    searchedAccountCap: MAX_SEARCH_PAGES * SEARCH_PAGE_SIZE,
    generatedAt: new Date().toISOString()
  }, 200, ctx.origin);
});
