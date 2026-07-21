import { createAdminClient } from "./config.ts";

export async function recordApiMetric(input: {
  endpoint: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  eventId?: string | null;
}): Promise<void> {
  const { error } = await createAdminClient().rpc("record_api_metric_secure", {
    p_endpoint: input.endpoint,
    p_status_code: input.statusCode,
    p_duration_ms: Math.round(input.durationMs),
    p_success: input.success,
    p_event_id: input.eventId ?? null,
  });
  if (error) throw new Error("api_metric_write_failed");
}
