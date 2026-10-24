import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://anhyun105.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
]);

function jsonResponse(body: unknown, status: number, origin: string) {
  const safeOrigin = allowedOrigins.has(origin) ? origin : "null";
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": safeOrigin,
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  });
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + size, bytes.length)));
  }
  return btoa(binary);
}

function safeGarmentText(value: unknown) {
  if (typeof value !== "string") return "an elegant, fully clothed couture outfit";
  const cleaned = value.replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 600) || "an elegant, fully clothed couture outfit";
}

function safeStoragePath(value: unknown, userId: string) {
  if (typeof value !== "string" || value.length > 500) return false;
  if (value.includes("..") || value.startsWith("/") || value.includes("\\")) return false;
  return value.startsWith(userId + "/try-on/") &&
    /\.(png|jpe?g|webp)$/i.test(value);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") return jsonResponse({ ok: true }, 200, origin);
  if (!allowedOrigins.has(origin)) return jsonResponse({ error: "Origin not allowed." }, 403, origin);
  if (req.method !== "POST") return jsonResponse({ error: "Use POST." }, 405, origin);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse({ error: "Sign in is required." }, 401, origin);
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SOVERA_SUPABASE_URL");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const publishableKey = publishableKeys.default || Deno.env.get("SOVERA_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secretKey = secretKeys.default || Deno.env.get("SOVERA_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!openAiKey || !supabaseUrl || !publishableKey || !secretKey) {
    return jsonResponse({ error: "AI try-on is not fully configured on the server." }, 503, origin);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  const user = userData.user;
  if (authError || !user) return jsonResponse({ error: "Your session is invalid. Please sign in again." }, 401, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be JSON." }, 400, origin);
  }

  if (body.consent !== true) {
    return jsonResponse({ error: "Explicit consent to AI image processing is required." }, 400, origin);
  }

  const storagePath = body.storagePath;
  if (!safeStoragePath(storagePath, user.id)) {
    return jsonResponse({ error: "The temporary photo path is invalid." }, 400, origin);
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let jobId: number | null = null;
  try {
    // The database function serializes per-user requests so parallel calls cannot bypass the limit.
    const { data: reservationRows, error: reservationError } = await adminClient.rpc(
      "reserve_ai_tryon_job",
      { p_user_id: user.id }
    );
    if (reservationError) throw new Error("The AI usage limit could not be reserved.");
    const reservation = Array.isArray(reservationRows) ? reservationRows[0] : reservationRows;
    if (!reservation?.allowed) {
      return jsonResponse({ error: "You have reached the limit of 5 AI try-on previews per hour. Please try again later." }, 429, origin);
    }
    jobId = reservation.job_id;
    await adminClient.from("activity_events").insert({
      user_id: user.id,
      event_type: "ai_tryon_requested",
      metadata: { source: "virtual_try_on" }
    });
    // This is read through the user's own RLS-protected Storage session.
    const { data: file, error: downloadError } = await userClient.storage
      .from("design-assets")
      .download(storagePath as string);
    if (downloadError || !file) throw new Error("Could not read the temporary private photo.");
    if (file.size > 12 * 1024 * 1024) throw new Error("The photo must be no larger than 12 MB.");

    const mime = file.type.toLowerCase();
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(mime)) throw new Error("Use a JPEG, PNG or WebP image.");
    const imageBytes = new Uint8Array(await file.arrayBuffer());
    const dataUrl = "data:" + mime + ";base64," + encodeBase64(imageBytes);
    const garmentText = safeGarmentText(body.garmentDescription);

    const identifierBytes = new TextEncoder().encode(user.id);
    const digest = await crypto.subtle.digest("SHA-256", identifierBytes);
    const safetyIdentifier = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");

    const prompt = [
      "Edit the supplied full-body person photo to show the described fashion garment being worn.",
      "Preserve the same person's identity, face, skin tone, body proportions, pose, hair, expression, camera angle and background.",
      "Only change the outfit area needed to dress the person. Make fabric drape, folds, seams, lighting and occlusion visually plausible.",
      "Garment brief: " + garmentText + ".",
      "Keep the clothing tasteful, fully clothed and non-transparent over intimate areas. Do not change the person's age or body shape.",
      "Do not add text, logos, jewellery, extra people or props. If the garment cannot be represented faithfully, produce a conservative fashion mockup rather than changing identity."
    ].join(" ");

    const openAiResponse = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + openAiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1.5",
        images: [{ image_url: dataUrl }],
        prompt,
        size: "1024x1536",
        quality: "medium",
        output_format: "webp",
        output_compression: 82,
        moderation: "auto",
        n: 1,
        safety_identifier: safetyIdentifier,
      })
    });

    const result = await openAiResponse.json().catch(() => ({}));
    if (!openAiResponse.ok) {
      const apiMessage = typeof result?.error?.message === "string"
        ? result.error.message.slice(0, 300)
        : "The image provider rejected the request.";
      throw new Error("AI image generation failed: " + apiMessage);
    }

    const generated = result?.data?.[0]?.b64_json;
    if (typeof generated !== "string" || generated.length < 100) {
      throw new Error("The image provider returned no usable image.");
    }

    await adminClient.from("ai_tryon_jobs").update({
      status: "succeeded",
      finished_at: new Date().toISOString()
    }).eq("id", jobId);
    await adminClient.from("activity_events").insert({
      user_id: user.id,
      event_type: "ai_tryon_succeeded",
      metadata: { source: "virtual_try_on" }
    });

    return jsonResponse({
      imageDataUrl: "data:image/webp;base64," + generated,
      note: "AI-generated visual estimate. It is not a guarantee of garment fit, fabric physics, size or construction."
    }, 200, origin);
  } catch (error) {
    if (jobId !== null) {
      await adminClient.from("ai_tryon_jobs").update({
        status: "failed",
        finished_at: new Date().toISOString()
      }).eq("id", jobId);
      await adminClient.from("activity_events").insert({
        user_id: user.id,
        event_type: "ai_tryon_failed",
        metadata: { source: "virtual_try_on" }
      });
    }
    console.error("Sovera virtual try-on failed:", error instanceof Error ? error.message : "Unknown error");
    const message = error instanceof Error ? error.message : "The AI try-on could not be completed.";
    const status = message.includes("no larger") || message.includes("Use a JPEG") ? 400 : 502;
    return jsonResponse({ error: message }, status, origin);
  } finally {
    // Best-effort deletion of the temporary private user photo after processing.
    try {
      if (typeof storagePath === "string" && safeStoragePath(storagePath, user.id)) {
        await userClient.storage.from("design-assets").remove([storagePath]);
      }
    } catch (cleanupError) {
      console.error("Temporary photo cleanup failed; review the private Storage bucket.", cleanupError);
    }
  }
});
