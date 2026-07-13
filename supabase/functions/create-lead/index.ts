import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  getIpHashSalt,
  getPolicyVersion,
} from "../_shared/config.ts";
import {
  getClientIp,
  HttpError,
  isAllowedOrigin,
  jsonResponse,
  readJsonBody,
  sha256,
} from "../_shared/http.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { validateLead } from "../_shared/validation.ts";
import { sendMetaLeadEvent } from "../_shared/meta-capi.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: isAllowedOrigin(request) ? 204 : 403,
      headers: {
        ...Object.fromEntries(new Headers({
          "Access-Control-Allow-Origin": request.headers.get("origin") ?? "",
          "Access-Control-Allow-Headers": "content-type, x-client-info",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin",
        })),
      },
    });
  }

  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, 403, { success: false, error: "origin_not_allowed" });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { success: false, error: "method_not_allowed" });
  }

  try {
    const payload = validateLead(await readJsonBody(request));

    // Honeypot: return a neutral response without touching the database.
    if (payload.website) {
      return jsonResponse(request, 202, {
        success: true,
        leadReference: crypto.randomUUID(),
      });
    }

    const ip = getClientIp(request);
    if (!(await verifyTurnstile(payload.turnstileToken, ip))) {
      throw new HttpError(422, "captcha_failed", "turnstileToken");
    }

    const ipHash = await sha256(`${getIpHashSalt()}:${ip}`);
    const supabase = createAdminClient();
    const { data: rateLimit, error: rateError } = await supabase.rpc(
      "check_lead_rate_limit_secure",
      {
        p_ip_hash: ipHash,
        p_endpoint: "create-lead",
        p_limit: 5,
        p_window_seconds: 900,
      },
    );

    if (rateError) throw new Error("rate_limit_unavailable");
    if (rateLimit?.allowed !== true) {
      return jsonResponse(request, 429, {
        success: false,
        error: "rate_limit_exceeded",
        retryAfter: rateLimit?.retry_after_seconds ?? 900,
      });
    }

    const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 512);
    const { data, error } = await supabase.rpc("capture_lead_secure_v2", {
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
      p_source_page: payload.landingPath ?? "/captura",
      p_ip_hash: ipHash,
      p_user_agent: userAgent,
      p_session_id: payload.sessionId ?? "",
      p_metadata: payload.metadata,
    });

    if (error || !data?.lead_reference) {
      console.error("create-lead database operation failed", {
        code: error?.code ?? "missing_result",
      });
      throw new Error("database_write_failed");
    }

    if (payload.consentMarketing) {
      try {
        await sendMetaLeadEvent({
          email: payload.email,
          phoneE164: payload.phoneE164,
          name: payload.name,
          countryIso: payload.countryIso,
          userAgent,
          publicReference: data.lead_reference,
          sourcePath: payload.landingPath ?? "/captura",
          fbc: payload.metadata.fbc,
          fbp: payload.metadata.fbp,
        });
      } catch (metaError) {
        console.error("meta-capi delivery failed", {
          code: metaError instanceof Error ? metaError.message : "unknown",
        });
      }
    }

    return jsonResponse(request, 200, {
      success: true,
      leadReference: data.lead_reference,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, error.status, {
        success: false,
        error: error.code,
        field: error.field,
      });
    }

    console.error("create-lead failed", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(request, 500, {
      success: false,
      error: "temporary_failure",
    });
  }
});
