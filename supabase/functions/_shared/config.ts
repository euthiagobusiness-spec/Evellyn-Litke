import { createClient } from "@supabase/supabase-js";

const DEFAULT_WHATSAPP_URL =
  "https://chat.whatsapp.com/J6IZBsPjpgwCR8u3mEn5jt";

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
  return Deno.env.get("PRIVACY_POLICY_VERSION") ?? "2026-07-13";
}

export function getIpHashSalt(): string {
  const salt = Deno.env.get("IP_HASH_SALT");
  if (!salt || salt.length < 24) {
    throw new Error("missing_ip_hash_salt");
  }
  return salt;
}

export function getWhatsappGroupUrl(): string {
  return Deno.env.get("WHATSAPP_GROUP_URL") ?? DEFAULT_WHATSAPP_URL;
}
