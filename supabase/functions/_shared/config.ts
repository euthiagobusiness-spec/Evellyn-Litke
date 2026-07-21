import { createClient } from "@supabase/supabase-js";

const WHATSAPP_CACHE_TTL_MS = 5 * 60 * 1000;
let whatsappCache: { url: string; expiresAt: number } | null = null;

function readNamedKey(jsonValue: string | undefined): string | null {
  if (!jsonValue) return null;

  try {
    const keys = JSON.parse(jsonValue);
    return typeof keys.default === "string" ? keys.default : null;
  } catch {
    return null;
  }
}

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const secretKey =
    readNamedKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !secretKey) {
    throw new Error("missing_backend_configuration");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getPolicyVersion(): string {
  return Deno.env.get("PRIVACY_POLICY_VERSION") ?? "2026-07-20";
}

export function getIpHashSalt(): string {
  const salt = Deno.env.get("IP_HASH_SALT");
  if (!salt || salt.length < 24) {
    throw new Error("missing_ip_hash_salt");
  }
  return salt;
}

export async function getWhatsappGroupUrl(
  client: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<string> {
  const configured = Deno.env.get("WHATSAPP_GROUP_URL")?.trim();
  if (configured?.startsWith("https://chat.whatsapp.com/")) return configured;

  if (whatsappCache && whatsappCache.expiresAt > Date.now()) {
    return whatsappCache.url;
  }

  const { data, error } = await client.rpc("get_funnel_setting_secure", {
    p_key: "whatsapp_group_url",
  });
  if (error || typeof data !== "string" || !data.startsWith("https://chat.whatsapp.com/")) {
    throw new Error("missing_whatsapp_group_url");
  }
  whatsappCache = {
    url: data,
    expiresAt: Date.now() + WHATSAPP_CACHE_TTL_MS,
  };
  return data;
}

export function getCanonicalSiteUrl(): string {
  const configured = Deno.env.get("SITE_URL")?.trim().replace(/\/$/, "");
  if (configured === "https://eventomrc.com.br") {
    return "https://www.eventomrc.com.br";
  }
  return configured || "https://www.eventomrc.com.br";
}

function requiredSecret(name: string, minimumLength = 24): string {
  const value = Deno.env.get(name)?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }
  return value;
}

export function getCapiWorkerToken(): string | null {
  const value = Deno.env.get("CAPI_WORKER_TOKEN")?.trim();
  return value && value.length >= 32 ? value : null;
}
