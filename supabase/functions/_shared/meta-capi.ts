import { createAdminClient } from "./config.ts";
import { sha256 } from "./http.ts";

type ClaimedMetaEvent = {
  id: string;
  eventId: string;
  eventName: "Lead";
  eventTime: number;
  eventSourceUrl: string;
  clientUserAgent?: string | null;
  clientIp?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  attempts: number;
  lead: {
    publicReference: string;
    email: string;
    phoneE164: string;
    name: string;
    countryIso?: string | null;
  };
};

type DeliveryResult = {
  success: boolean;
  httpStatus: number;
  latencyMs: number;
  responseCode: string | null;
  errorCode: string | null;
};

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function nameParts(name: string): [string, string] {
  const parts = normalized(name).split(/\s+/).filter(Boolean);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

function metaConfiguration(): { token: string; pixelId: string; apiVersion: string } | null {
  const token = Deno.env.get("META_CONVERSIONS_API_TOKEN")?.trim();
  const pixelId = Deno.env.get("META_PIXEL_ID")?.trim();
  if (!token || !pixelId) return null;
  return {
    token,
    pixelId,
    apiVersion: Deno.env.get("META_GRAPH_API_VERSION")?.trim() || "v23.0",
  };
}

async function sendMetaLeadEvent(input: ClaimedMetaEvent): Promise<DeliveryResult> {
  const startedAt = performance.now();
  const config = metaConfiguration();
  if (!config) {
    return {
      success: false,
      httpStatus: 503,
      latencyMs: 0,
      responseCode: null,
      errorCode: "meta_configuration_missing",
    };
  }

  const [firstName, lastName] = nameParts(input.lead.name);
  const userData: Record<string, unknown> = {
    em: [await sha256(normalized(input.lead.email))],
    ph: [await sha256(input.lead.phoneE164.replace(/\D/g, ""))],
    external_id: [await sha256(input.lead.publicReference)],
  };
  if (input.lead.countryIso) {
    userData.country = [await sha256(normalized(input.lead.countryIso))];
  }
  if (firstName) userData.fn = [await sha256(firstName)];
  if (lastName) userData.ln = [await sha256(lastName)];
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent.slice(0, 512);
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.fbc) userData.fbc = input.fbc.slice(0, 512);
  if (input.fbp) userData.fbp = input.fbp.slice(0, 512);

  try {
    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(config.pixelId)}/events`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: [{
            event_name: input.eventName,
            event_time: input.eventTime || Math.floor(Date.now() / 1000),
            event_id: input.eventId,
            action_source: "website",
            event_source_url: input.eventSourceUrl,
            user_data: userData,
            custom_data: { content_name: "Método Referência Cristã" },
          }],
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const error = body.error && typeof body.error === "object"
      ? body.error as Record<string, unknown>
      : null;
    const eventsReceived = typeof body.events_received === "number"
      ? String(body.events_received)
      : null;
    return {
      success: response.ok && body.events_received === 1,
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      responseCode: eventsReceived,
      errorCode: error && (typeof error.code === "number" || typeof error.code === "string")
        ? String(error.code)
        : response.ok ? null : "meta_rejected",
    };
  } catch (error) {
    return {
      success: false,
      httpStatus: error instanceof DOMException && error.name === "TimeoutError" ? 504 : 503,
      latencyMs: Math.round(performance.now() - startedAt),
      responseCode: null,
      errorCode: error instanceof DOMException && error.name === "TimeoutError"
        ? "meta_timeout"
        : "meta_network_error",
    };
  }
}

export async function processMetaOutboxBatch(options: {
  limit?: number;
  eventId?: string | null;
} = {}): Promise<{ claimed: number; sent: number; failed: number }> {
  if (!metaConfiguration()) throw new Error("meta_configuration_missing");

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_meta_outbox_secure", {
    p_limit: Math.max(1, Math.min(options.limit ?? 10, 50)),
    p_event_id: options.eventId ?? null,
  });
  if (error) throw new Error("meta_outbox_claim_failed");

  const items = (Array.isArray(data) ? data : []) as ClaimedMetaEvent[];
  let sent = 0;
  let failed = 0;

  await Promise.all(items.map(async (item) => {
    const result = await sendMetaLeadEvent(item);
    const { error: finishError } = await supabase.rpc("finish_meta_outbox_secure", {
      p_outbox_id: item.id,
      p_success: result.success,
      p_http_status: result.httpStatus,
      p_latency_ms: result.latencyMs,
      p_response_code: result.responseCode ?? "",
      p_error_code: result.errorCode ?? "",
    });
    if (finishError) throw new Error("meta_outbox_finish_failed");
    if (result.success) sent += 1;
    else failed += 1;
  }));

  return { claimed: items.length, sent, failed };
}
