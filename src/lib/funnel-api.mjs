import { SITE_CONFIG } from "../config.mjs";

export class FunnelApiError extends Error {
  constructor(message, { status = 0, code = "network_error", field = null } = {}) {
    super(message);
    this.name = "FunnelApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

function functionUrl(functionName, query = "") {
  const suffix = query ? `?${query}` : "";
  return `${SITE_CONFIG.functionsBaseUrl}/${functionName}${suffix}`;
}

async function readResult(response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) {
    throw new FunnelApiError("request_failed", {
      status: response.status,
      code: result.error ?? "request_failed",
      field: result.field ?? null,
    });
  }
  return result;
}

function normalizedNetworkError(error) {
  if (error instanceof FunnelApiError) return error;
  return new FunnelApiError(
    error?.name === "AbortError" ? "request_timeout" : "network_error",
  );
}

function notifyApiMeasurement(endpoint, startedAt, httpStatus, success) {
  if (endpoint === "collect-funnel-event" || typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("mrc:api-latency", {
      detail: {
        endpoint,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        httpStatus,
        success,
      },
    }));
  } catch {
    // Telemetria não interfere na chamada principal.
  }
}

export async function callFunction(
  functionName,
  payload,
  { timeoutMs = 10_000, keepalive = false } = {},
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  let httpStatus = 0;
  let success = false;

  try {
    const response = await fetch(functionUrl(functionName), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      keepalive,
    });
    httpStatus = response.status;
    const result = await readResult(response);
    success = true;
    return result;
  } catch (error) {
    throw normalizedNetworkError(error);
  } finally {
    window.clearTimeout(timeout);
    notifyApiMeasurement(functionName, startedAt, httpStatus, success);
  }
}

export function collectFirstPartyEvent(payload) {
  return callFunction("collect-funnel-event", payload, {
    timeoutMs: 2_000,
    keepalive: true,
  });
}

export function trackFunnelEvent(eventName, leadReference, sessionId, options = {}) {
  if (!leadReference) return Promise.resolve(null);

  return callFunction(
    "track-funnel-event",
    {
      leadReference,
      eventName,
      page: window.location.pathname,
      sessionId,
      metadata: {
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
    options,
  );
}

async function dashboardRequest(token, { method = "GET", days = 7, body } = {}) {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) {
    throw new FunnelApiError("dashboard_token_required", {
      status: 401,
      code: "dashboard_token_required",
    });
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  let httpStatus = 0;
  let success = false;
  const query = new URLSearchParams({ days: String(Math.min(30, Math.max(1, Number(days) || 7))) });

  try {
    const response = await fetch(functionUrl("funnel-dashboard", query.toString()), {
      method,
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    httpStatus = response.status;
    const result = await readResult(response);
    success = true;
    return result;
  } catch (error) {
    throw normalizedNetworkError(error);
  } finally {
    window.clearTimeout(timeout);
    notifyApiMeasurement("funnel-dashboard", startedAt, httpStatus, success);
  }
}

export function fetchFunnelDashboard(token, days = 7) {
  return dashboardRequest(token, { days });
}

export function importMetaMetrics(token, rows, days = 7) {
  return dashboardRequest(token, {
    method: "POST",
    days,
    body: { action: "import_meta", rows },
  });
}

export function recordGroupSnapshot(token, snapshot, days = 7) {
  return dashboardRequest(token, {
    method: "POST",
    days,
    body: {
      action: "group_snapshot",
      total: Number(snapshot?.total),
      adminCount: Number(snapshot?.adminCount ?? 0),
      reportedExits: Number(snapshot?.reportedExits ?? 0),
      isBaseline: snapshot?.isBaseline === true,
      note: String(snapshot?.note ?? "").trim().slice(0, 200),
    },
  });
}
