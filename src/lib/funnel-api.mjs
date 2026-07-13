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

export async function callFunction(
  functionName,
  payload,
  { timeoutMs = 10_000, keepalive = false } = {},
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${SITE_CONFIG.functionsBaseUrl}/${functionName}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        keepalive,
      },
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true) {
      throw new FunnelApiError("request_failed", {
        status: response.status,
        code: result.error ?? "request_failed",
        field: result.field ?? null,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof FunnelApiError) throw error;
    throw new FunnelApiError(
      error?.name === "AbortError" ? "request_timeout" : "network_error",
    );
  } finally {
    window.clearTimeout(timeout);
  }
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
