import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  getIpHashSalt,
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
import { validateEvent } from "../_shared/validation.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return preflightResponse(request);
  }

  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, 403, { success: false, error: "origin_not_allowed" });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { success: false, error: "method_not_allowed" });
  }

  try {
    const payload = validateEvent(await readJsonBody(request));
    const ipHash = await sha256(`${getIpHashSalt()}:${getClientIp(request)}`);
    const supabase = createAdminClient();

    const { data: rateLimit, error: rateError } = await supabase.rpc(
      "check_lead_rate_limit_secure",
      {
        p_ip_hash: ipHash,
        p_endpoint: "track-funnel-event",
        p_limit: 40,
        p_window_seconds: 900,
      },
    );

    if (rateError) throw new Error("rate_limit_unavailable");
    if (rateLimit?.allowed !== true) {
      return jsonResponse(request, 429, {
        success: false,
        error: "rate_limit_exceeded",
      });
    }

    const { data, error } = await supabase.rpc("track_funnel_event_secure", {
      p_lead_reference: payload.leadReference,
      p_event_name: payload.eventName,
      p_page: payload.page ?? "",
      p_session_id: payload.sessionId ?? "",
      p_metadata: payload.metadata,
    });

    if (error) {
      console.error("track-funnel-event database operation failed", {
        code: error.code,
      });
      throw new Error("database_write_failed");
    }

    if (data !== true) {
      return jsonResponse(request, 404, {
        success: false,
        error: "lead_not_found",
      });
    }

    return jsonResponse(request, 200, {
      success: true,
      whatsappUrl: getWhatsappGroupUrl(),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, error.status, {
        success: false,
        error: error.code,
        field: error.field,
      });
    }

    console.error("track-funnel-event failed", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(request, 500, {
      success: false,
      error: "temporary_failure",
    });
  }
});
