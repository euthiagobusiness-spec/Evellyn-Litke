import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, getIpHashSalt } from "../_shared/config.ts";
import {
  getClientIp,
  HttpError,
  isAllowedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  sha256,
} from "../_shared/http.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { validatePrivacyRequest } from "../_shared/validation.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, 403, { success: false, error: "origin_not_allowed" });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, 405, { success: false, error: "method_not_allowed" });
  }

  try {
    const payload = validatePrivacyRequest(await readJsonBody(request));
    if (payload.website) {
      return jsonResponse(request, 202, {
        success: true,
        requestReference: crypto.randomUUID(),
      });
    }

    const ip = getClientIp(request);
    const turnstileToken = request.headers.get("x-turnstile-token");
    if (!(await verifyTurnstile(turnstileToken, ip))) {
      throw new HttpError(422, "captcha_failed", "turnstileToken");
    }

    const salt = getIpHashSalt();
    const ipHash = await sha256(`${salt}:${ip}`);
    const emailHash = await sha256(`${salt}:${payload.email}`);
    const supabase = createAdminClient();
    const { data: rateLimit, error: rateError } = await supabase.rpc(
      "check_lead_rate_limit_secure",
      {
        p_ip_hash: ipHash,
        p_endpoint: "privacy-request",
        p_limit: 3,
        p_window_seconds: 86400,
      },
    );
    if (rateError) throw new Error("rate_limit_unavailable");
    if (rateLimit?.allowed !== true) {
      return jsonResponse(request, 429, { success: false, error: "rate_limit_exceeded" });
    }

    const { data, error } = await supabase.rpc("submit_data_subject_request_secure", {
      p_request_type: payload.requestType,
      p_requester_name: payload.name,
      p_email: payload.email,
      p_email_hash: emailHash,
      p_phone_e164: payload.phoneE164,
      p_requested_changes: payload.requestedChanges,
      p_ip_hash: ipHash,
    });
    if (error || typeof data !== "string") {
      console.error("privacy-request database operation failed", {
        code: error?.code ?? "missing_result",
      });
      throw new Error("database_write_failed");
    }

    return jsonResponse(request, 201, {
      success: true,
      requestReference: data,
      status: "pending_verification",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, error.status, {
        success: false,
        error: error.code,
        field: error.field,
      });
    }
    console.error("privacy-request failed", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(request, 500, { success: false, error: "temporary_failure" });
  }
});
