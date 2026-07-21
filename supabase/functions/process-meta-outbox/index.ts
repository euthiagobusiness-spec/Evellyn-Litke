import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { authorizeDashboardRequest } from "../_shared/dashboard-auth.ts";
import { getCapiWorkerToken } from "../_shared/config.ts";
import { jsonResponse, readBearerToken, readJsonBody, timingSafeEqual } from "../_shared/http.ts";
import { processMetaOutboxBatch } from "../_shared/meta-capi.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(request, 405, { success: false, error: "method_not_allowed" });
  }

  const candidate = readBearerToken(request);
  const workerToken = getCapiWorkerToken();
  const workerAuthorized = workerToken ? timingSafeEqual(candidate, workerToken) : false;
  if (!workerAuthorized && !(await authorizeDashboardRequest(request))) {
    return jsonResponse(request, 401, { success: false, error: "unauthorized" });
  }

  try {
    const body = await readJsonBody(request).catch(() => ({})) as Record<string, unknown>;
    const requestedLimit = Number(body.limit ?? 20);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 50))
      : 20;
    const result = await processMetaOutboxBatch({ limit });
    return jsonResponse(request, 200, { success: true, ...result });
  } catch (error) {
    console.error("process-meta-outbox failed", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(request, 500, { success: false, error: "temporary_failure" });
  }
});
