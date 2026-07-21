import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  getIpHashSalt,
  getPolicyVersion,
  getWhatsappGroupUrl,
} from "../_shared/config.ts";
import {
  getClientIp,
  HttpError,
  isAllowedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  sha256,
} from "../_shared/http.ts";
import { processMetaOutboxBatch } from "../_shared/meta-capi.ts";
import { recordApiMetric } from "../_shared/observe.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { validateLead } from "../_shared/validation.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const edgeRuntime = (globalThis as unknown as {
  EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
}).EdgeRuntime;

function runInBackground(promise: Promise<unknown>): void {
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(promise);
    return;
  }
  // The durable outbox is already committed. If a non-Supabase runtime cannot
  // keep this promise alive, the scheduled worker safely retries it later.
  void promise.catch(() => undefined);
}

Deno.serve(async (request: Request) => {
  const startedAt = performance.now();
  let metricEventId: string | null = null;

  const respond = (status: number, body: Record<string, unknown>) => {
    if (request.method !== "OPTIONS") {
      runInBackground(recordApiMetric({
        endpoint: "create-lead",
        statusCode: status,
        durationMs: performance.now() - startedAt,
        success: status >= 200 && status < 300,
        eventId: metricEventId,
      }).catch(() => undefined));
    }
    return jsonResponse(request, status, body);
  };

  if (request.method === "OPTIONS") return preflightResponse(request);
  if (!isAllowedOrigin(request)) {
    return respond(403, { success: false, error: "origin_not_allowed" });
  }
  if (request.method !== "POST") {
    return respond(405, { success: false, error: "method_not_allowed" });
  }

  try {
    const payload = validateLead(await readJsonBody(request));
    const headerKey = request.headers.get("x-idempotency-key")?.trim() ?? null;
    if (headerKey && !UUID_PATTERN.test(headerKey)) {
      throw new HttpError(422, "invalid", "idempotencyKey");
    }
    const idempotencyKey = payload.idempotencyKey ?? headerKey ?? crypto.randomUUID();
    const eventId = payload.eventId ?? crypto.randomUUID();
    metricEventId = eventId;

    // Bots receive a neutral success but never touch lead, consent or CAPI tables.
    if (payload.website) {
      return respond(202, {
        success: true,
        leadReference: crypto.randomUUID(),
      });
    }

    const ip = getClientIp(request);
    if (!(await verifyTurnstile(payload.turnstileToken, ip))) {
      throw new HttpError(422, "captcha_failed", "turnstileToken");
    }

    const fingerprintSalt = getIpHashSalt();
    const ipHash = await sha256(`${fingerprintSalt}:${ip}`);
    const requestFingerprint = await sha256([
      fingerprintSalt,
      "lead-fingerprint-v1",
      payload.email,
      payload.phoneE164,
      payload.name.normalize("NFKC").trim().toLowerCase(),
      payload.countryIso,
    ].join("|"));
    const supabase = createAdminClient();
    const [whatsappUrl, rateLimitResult] = await Promise.all([
      getWhatsappGroupUrl(supabase),
      supabase.rpc(
        "check_lead_rate_limit_secure",
        {
          p_ip_hash: ipHash,
          p_endpoint: "create-lead",
          p_limit: 8,
          p_window_seconds: 900,
        },
      ),
    ]);
    const { data: rateLimit, error: rateError } = rateLimitResult;

    if (rateError) throw new Error("rate_limit_unavailable");
    if (rateLimit?.allowed !== true) {
      return respond(429, {
        success: false,
        error: "rate_limit_exceeded",
        retryAfter: rateLimit?.retry_after_seconds ?? 900,
      });
    }

    const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 512);
    const { data, error } = await supabase.rpc("capture_lead_secure_v3", {
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: requestFingerprint,
      p_event_id: eventId,
      p_name: payload.name,
      p_email: payload.email,
      p_phone: payload.phone,
      p_phone_e164: payload.phoneE164,
      p_country_iso: payload.countryIso,
      p_country_calling_code: payload.countryCallingCode,
      p_business_stage: payload.businessStage ?? "",
      p_goal: payload.goal ?? "",
      p_niche: payload.niche ?? "",
      p_instagram_handle: payload.instagramHandle ?? "",
      p_audience_size: payload.audienceSize ?? "",
      p_biggest_challenge: payload.biggestChallenge ?? "",
      p_preferred_contact_period: payload.preferredContactPeriod ?? "",
      p_utm_source: payload.utmSource ?? "",
      p_utm_medium: payload.utmMedium ?? "",
      p_utm_campaign: payload.utmCampaign ?? "",
      p_utm_content: payload.utmContent ?? "",
      p_utm_term: payload.utmTerm ?? "",
      p_gclid: payload.gclid ?? "",
      p_fbclid: payload.fbclid ?? "",
      p_referrer: payload.referrer ?? "",
      p_landing_path: payload.landingPath ?? "",
      p_consent_privacy: payload.consentPrivacy,
      p_consent_marketing: payload.consentMarketing,
      p_consent_analytics: payload.consentAnalytics,
      p_policy_version: getPolicyVersion(),
      p_source_page: payload.landingPath ?? "/",
      p_ip_hash: ipHash,
      p_client_ip: ip === "unknown" ? "" : ip,
      p_user_agent: userAgent,
      p_session_id: payload.consentAnalytics ? payload.sessionId ?? "" : "",
      p_metadata: payload.metadata,
    });

    if (error || !data?.lead_reference) {
      // Only a database error code is logged. Lead fields never reach logs.
      console.error("create-lead database operation failed", {
        code: error?.code ?? "missing_result",
      });
      throw new Error("database_write_failed");
    }

    const attribution = {
      campaign_id: payload.metadata.campaignId,
      adset_id: payload.metadata.adsetId,
      ad_id: payload.metadata.adId,
      placement: payload.metadata.placement,
      landing_url: payload.metadata.landingUrl,
    };
    if (Object.values(attribution).some(Boolean)) {
      runInBackground((async () => {
        const { data: attributionSaved, error: attributionError } = await supabase.rpc(
          "enrich_lead_attribution_secure",
          {
            p_lead_reference: data.lead_reference,
            p_attribution: attribution,
          },
        );
        if (attributionError || attributionSaved !== true) {
          console.error("create-lead attribution operation failed", {
            code: attributionError?.code ?? "missing_result",
          });
        }
      })());
    }

    const conversionEligible = data.lead_action === "created";
    if (data.meta_queued === true && conversionEligible) {
      runInBackground(
        processMetaOutboxBatch({ limit: 1, eventId: data.event_id }).catch((error) => {
          console.error("meta outbox background task failed", {
            code: error instanceof Error ? error.message : "unknown",
          });
        }),
      );
    }

    return respond(200, {
      success: true,
      leadReference: data.lead_reference,
      leadAction: data.lead_action,
      eventId: data.event_id,
      conversionEligible,
      whatsappUrl,
      idempotentReplay: data.idempotent_replay === true,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return respond(error.status, {
        success: false,
        error: error.code,
        field: error.field,
      });
    }

    console.error("create-lead failed", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return respond(500, { success: false, error: "temporary_failure" });
  }
});
