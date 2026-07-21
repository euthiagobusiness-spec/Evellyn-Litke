import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  getCanonicalSiteUrl,
  getIpHashSalt,
} from "../_shared/config.ts";
import { authorizeDashboardRequest } from "../_shared/dashboard-auth.ts";
import {
  HttpError,
  getClientIp,
  isAllowedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  sha256,
} from "../_shared/http.ts";

function sanitizedText(value: unknown, field: string, maxLength: number, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new HttpError(422, "required", field);
    return null;
  }
  if (typeof value !== "string") throw new HttpError(422, "invalid", field);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!normalized || normalized.length > maxLength) throw new HttpError(422, "invalid", field);
  return normalized;
}

function nonNegativeNumber(value: unknown, field: string, integer = false): number {
  if (value === undefined || value === null || value === "") {
    throw new HttpError(422, "required", field);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new HttpError(422, "invalid", field);
  }
  return parsed;
}

function optionalNonNegativeNumber(value: unknown, field: string, integer = false): number | null {
  if (value === undefined || value === null || value === "") return null;
  return nonNegativeNumber(value, field, integer);
}

function validDate(value: unknown, field: string): string {
  const date = sanitizedText(value, field, 10, true)!;
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new HttpError(422, "invalid", field);
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    parsed.getUTCFullYear() !== Number(match[1])
    || parsed.getUTCMonth() !== Number(match[2]) - 1
    || parsed.getUTCDate() !== Number(match[3])
  ) {
    throw new HttpError(422, "invalid", field);
  }
  return date;
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?\d[\s().-]*){8,15}/;

function rejectsPii(value: string | null): boolean {
  return Boolean(value && (EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value)));
}

async function enforceRateLimit(
  supabase: ReturnType<typeof createAdminClient>,
  ipHash: string,
  endpoint: string,
  limit: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_lead_rate_limit_secure", {
    p_ip_hash: ipHash,
    p_endpoint: endpoint,
    p_limit: limit,
    p_window_seconds: 900,
  });
  if (error) throw new Error("rate_limit_unavailable");
  return data?.allowed === true;
}

type SiteHealth = {
  routesHealthy: boolean | null;
  sslHealthy: boolean | null;
  siteHealthCheckedAt: string;
};

let siteHealthCache: { expiresAt: number; value: SiteHealth } | null = null;

async function probeSiteHealth(): Promise<SiteHealth> {
  const now = Date.now();
  if (siteHealthCache && siteHealthCache.expiresAt > now) return siteHealthCache.value;

  const siteUrl = getCanonicalSiteUrl();
  const targets = ["/", "/upsell"].map((path) => `${siteUrl}${path}`);
  const results = await Promise.allSettled(targets.map((target) => fetch(target, {
    method: "HEAD",
    redirect: "follow",
    signal: AbortSignal.timeout(4_000),
  })));
  const successfulResponses = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const value: SiteHealth = {
    routesHealthy: results.every((result) => result.status === "fulfilled" && result.value.ok),
    // A successful HTTPS response proves that DNS and the TLS handshake worked.
    sslHealthy: siteUrl.startsWith("https://")
      ? successfulResponses.length > 0
      : null,
    siteHealthCheckedAt: new Date().toISOString(),
  };
  siteHealthCache = { expiresAt: now + 5 * 60_000, value };
  return value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (request.headers.get("origin") && !isAllowedOrigin(request)) {
    return jsonResponse(request, 403, { success: false, error: "origin_not_allowed" });
  }

  const supabase = createAdminClient();
  try {
    const ipHash = await sha256(`${getIpHashSalt()}:${getClientIp(request)}`);
    if (!(await enforceRateLimit(supabase, ipHash, "funnel-dashboard-auth", 60))) {
      return jsonResponse(request, 429, { success: false, error: "rate_limit_exceeded" });
    }
    if (!(await authorizeDashboardRequest(request))) {
      return jsonResponse(request, 401, { success: false, error: "unauthorized" });
    }

    if (request.method === "GET") {
      const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 7);
      const days = Number.isInteger(requestedDays)
        ? Math.max(1, Math.min(requestedDays, 90))
        : 7;
      const { data, error } = await supabase.rpc("get_funnel_dashboard_secure", {
        p_days: days,
      });
      if (error || !data) throw new Error("dashboard_query_failed");
      const dashboard = data as Record<string, unknown>;
      const siteHealth = await probeSiteHealth();
      const health = dashboard.health && typeof dashboard.health === "object" && !Array.isArray(dashboard.health)
        ? dashboard.health as Record<string, unknown>
        : {};
      return jsonResponse(request, 200, {
        success: true,
        ...dashboard,
        health: { ...health, ...siteHealth },
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(request, 405, { success: false, error: "method_not_allowed" });
    }

    if (!(await enforceRateLimit(supabase, ipHash, "funnel-dashboard-write", 30))) {
      return jsonResponse(request, 429, { success: false, error: "rate_limit_exceeded" });
    }

    const body = await readJsonBody(request, 300_000) as Record<string, unknown>;
    const action = sanitizedText(body.action, "action", 40, true);

    if (action === "group_snapshot") {
      const count = nonNegativeNumber(body.total ?? body.count, "total", true);
      const adminCount = nonNegativeNumber(body.adminCount, "adminCount", true);
      const reportedExits = nonNegativeNumber(body.reportedExits, "reportedExits", true);
      if (count > 1_000_000 || adminCount > count || reportedExits > 1_000_000) {
        throw new HttpError(422, "invalid", "groupSnapshot");
      }
      const note = sanitizedText(body.note, "note", 200);
      if (rejectsPii(note)) throw new HttpError(422, "pii_not_allowed", "note");
      const { error } = await supabase.from("group_member_snapshots").insert({
        member_count: count,
        admin_count: adminCount,
        reported_exits: reportedExits,
        is_baseline: body.isBaseline === true,
        source: "manual",
        note,
      });
      if (error) throw new Error("group_snapshot_write_failed");
      return jsonResponse(request, 201, {
        success: true,
        action,
        total: count,
        adminCount,
        reportedExits,
        isBaseline: body.isBaseline === true,
      });
    }

    if (action === "import_meta") {
      if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 1_000) {
        throw new HttpError(422, "invalid", "rows");
      }

      const rows = await Promise.all(body.rows.map(async (item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new HttpError(422, "invalid", `rows.${index}`);
        }
        const row = item as Record<string, unknown>;
        const metricDate = validDate(row.date ?? row.metricDate, `rows.${index}.date`);
        const campaignId = sanitizedText(row.campaignId, `rows.${index}.campaignId`, 100);
        const suppliedCampaignName = sanitizedText(row.campaignName ?? row.campaign, `rows.${index}.campaignName`, 300);
        if (!campaignId && !suppliedCampaignName) {
          throw new HttpError(422, "required", `rows.${index}.campaignName`);
        }
        const campaignName = suppliedCampaignName ?? `[ID ${campaignId}]`;
        const adsetId = sanitizedText(row.adsetId, `rows.${index}.adsetId`, 100);
        const adsetName = sanitizedText(row.adsetName ?? row.adset, `rows.${index}.adsetName`, 300);
        const adId = sanitizedText(row.adId, `rows.${index}.adId`, 100);
        const adName = sanitizedText(row.adName ?? row.ad, `rows.${index}.adName`, 300);
        if (!adId && !adName) throw new HttpError(422, "required", `rows.${index}.adName`);
        const angle = sanitizedText(row.angle, `rows.${index}.angle`, 120);
        const creativeFormat = sanitizedText(row.format, `rows.${index}.format`, 80);
        const hook = sanitizedText(row.hook, `rows.${index}.hook`, 200);
        if ([angle, creativeFormat, hook].some(rejectsPii)) {
          throw new HttpError(422, "pii_not_allowed", `rows.${index}.creativeMetadata`);
        }
        const externalKey = await sha256([
          metricDate,
          campaignId ?? campaignName,
          adsetId ?? adsetName ?? "",
          adId ?? adName ?? "",
        ].join("|"));
        return {
          external_key: externalKey,
          metric_date: metricDate,
          campaign_id: campaignId,
          campaign_name: campaignName,
          adset_id: adsetId,
          adset_name: adsetName,
          ad_id: adId,
          ad_name: adName,
          angle,
          creative_format: creativeFormat,
          hook,
          spend: nonNegativeNumber(row.spend, `rows.${index}.spend`),
          impressions: nonNegativeNumber(row.impressions, `rows.${index}.impressions`, true),
          reach: optionalNonNegativeNumber(row.reach, `rows.${index}.reach`, true),
          link_clicks: optionalNonNegativeNumber(row.linkClicks, `rows.${index}.linkClicks`, true),
          all_clicks: optionalNonNegativeNumber(row.allClicks, `rows.${index}.allClicks`, true),
          landing_page_views: optionalNonNegativeNumber(row.landingPageViews, `rows.${index}.landingPageViews`, true),
          meta_leads: optionalNonNegativeNumber(row.metaLeads, `rows.${index}.metaLeads`, true),
          imported_at: new Date().toISOString(),
        };
      }));

      const { error } = await supabase.from("meta_campaign_daily").upsert(rows, {
        onConflict: "external_key",
      });
      if (error) throw new Error("meta_import_failed");
      return jsonResponse(request, 200, { success: true, action, imported: rows.length });
    }

    throw new HttpError(422, "invalid", "action");
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(request, error.status, {
        success: false,
        error: error.code,
        field: error.field,
      });
    }
    console.error("funnel-dashboard failed", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return jsonResponse(request, 500, { success: false, error: "temporary_failure" });
  }
});
