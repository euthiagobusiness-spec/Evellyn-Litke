import { sha256 } from "./http.ts";

type MetaLeadInput = {
  email: string;
  phoneE164: string;
  name: string;
  countryIso: string;
  userAgent: string;
  publicReference: string;
  sourcePath: string;
  fbc?: string;
  fbp?: string;
};

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function nameParts(name: string): [string, string] {
  const parts = normalized(name).split(/\s+/).filter(Boolean);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

export async function sendMetaLeadEvent(input: MetaLeadInput): Promise<void> {
  const token = Deno.env.get("META_CONVERSIONS_API_TOKEN")?.trim();
  const pixelId = Deno.env.get("META_PIXEL_ID")?.trim();
  if (!token || !pixelId) return;

  const [firstName, lastName] = nameParts(input.name);
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://evellyn-litke.vercel.app")
    .replace(/\/$/, "");
  const apiVersion = Deno.env.get("META_GRAPH_API_VERSION")?.trim() || "v20.0";
  const userData: Record<string, unknown> = {
    em: [await sha256(normalized(input.email))],
    ph: [await sha256(input.phoneE164.replace(/\D/g, ""))],
    external_id: [await sha256(input.publicReference)],
    country: [await sha256(normalized(input.countryIso))],
    client_user_agent: input.userAgent.slice(0, 512),
  };
  if (firstName) userData.fn = [await sha256(firstName)];
  if (lastName) userData.ln = [await sha256(lastName)];
  if (input.fbc) userData.fbc = input.fbc.slice(0, 512);
  if (input.fbp) userData.fbp = input.fbp.slice(0, 512);

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: [{
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000),
          event_id: `${input.publicReference}:lead`,
          action_source: "website",
          event_source_url: `${siteUrl}${input.sourcePath.startsWith("/") ? input.sourcePath : `/${input.sourcePath}`}`,
          user_data: userData,
          custom_data: { content_name: "Método Referência Cristã" },
        }],
      }),
      signal: AbortSignal.timeout(1500),
    },
  );

  if (!response.ok) {
    console.error("meta-capi request failed", { status: response.status });
  }
}
