const supabaseUrl =
  import.meta.env?.VITE_SUPABASE_URL ?? "https://zsrgdjzouhykatrypdmr.supabase.co";

export const SITE_CONFIG = Object.freeze({
  functionsBaseUrl: `${supabaseUrl.replace(/\/$/, "")}/functions/v1`,
  whatsappGroupUrl: "https://chat.whatsapp.com/J6IZBsPjpgwCR8u3mEn5jt",
  upsellCheckoutUrl: import.meta.env?.VITE_UPSELL_CHECKOUT_URL?.trim() ?? "",
  privacyPolicyVersion: "2026-07-13",
});
