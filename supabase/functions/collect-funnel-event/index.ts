import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  getIpHashSalt,
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
import { validateFirstPartyEvent } from "../_shared/validation.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, 403, { success: false, error: "origin_not_allowed" });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, 405, { success: false, error: "method_not_allowed" });
  }

  try {
    const payload = validateFirstPartyEvent(await readJsonBody(request));
    if (payload.website) {
      return jsonResponse(request, 202, { success: true, accepted: true });
    }

    const ipHash = await sha256(`${getIpHashSalt()}:${getClientIp(request)}`);
    const supabase = createAdminClient();
    const { data: rateLimit, error: rateError } = await supabase.rpc(
      "check_lead_rate_limit_secure",
      {
        p_ip_hash: ipHash,
        p_endpoint: "collect-funnel-event",
        p_limit: 100,
        p_window_seconds: 900,
      },
    );
    if (rateError) throw new Error("rate_limit_unavailable");
    if (rateLimit?.allowed !== true) {
      return jsonResponse(request, 429, { success: false, error: "rate_limit_exceeded" });
    }

    const { data, error } = await supabase.rpc("record_first_party_event_secure", {
      p_event_id: payload.eventId,
      p_event_name: payload.eventName,
      p_lead_reference: payload.leadReference,
      p_session_id: payload.sessionId ?? "",
      p_page: payload.page ?? "",
      p_occurred_at: payload.occurredAt,
      p_consent_analytics: payload.consentAnalytics,
      p_utm_source: payload.utm.source ?? "",
      p_utm_medium: payload.utm.medium ?? "",
      p_utm_campaign: payload.utm.campaign ?? "",
      p_utm_content: payload.utm.content ?? "",
      p_utm_term: payload.utm.term ?? "",
      p_metadata: payload.metadata,
      p_ip_hash: ipHash,
      p_duration_ms: payload.durationMs,
      p_is_suspicious: false,
    });
    if (error) {
      console.error("collect-funnel-event database operation failed", { code: error.code });
      throw new Error("database_write_failed");
    }

    return jsonResponse(request, 200, {
      success: true,
      accepted: data?.accepted === true,
      inserted: data?.inserted === true,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, error.status, {
        success: false,
        error: error.code,
        field: error.field,
      });
    }
    console.error("collect-funnel-event failed", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(request, 500, { success: false, error: "temporary_failure" });
  }
});
