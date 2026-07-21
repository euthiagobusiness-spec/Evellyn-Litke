import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const privacyRequest = await readFile(
  new URL("../solicitar-privacidade.html", import.meta.url),
  "utf8",
);
const privacyScript = await readFile(
  new URL("../src/pages/privacy-request.mjs", import.meta.url),
  "utf8",
);
const vite = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
const localServer = await readFile(new URL("../local-server.js", import.meta.url), "utf8");
const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const createLead = await readFile(
  new URL("../supabase/functions/create-lead/index.ts", import.meta.url),
  "utf8",
);
const edgeConfig = await readFile(
  new URL("../supabase/functions/_shared/config.ts", import.meta.url),
  "utf8",
);

test("titular pode registrar pedido LGPD sem exclusão automática", () => {
  for (const requestType of ["access", "correction", "deletion", "portability", "withdrawal"]) {
    assert.match(privacyRequest, new RegExp(`value="${requestType}"`));
  }
  assert.match(privacyRequest, /name="consentPrivacy" required/);
  assert.match(privacyRequest, /pendentes até a confirmação segura da identidade/i);
  assert.match(privacyScript, /callFunction\("privacy-request"/);
  assert.match(vite, /solicitar-privacidade\.html/);
  assert.match(localServer, /\/solicitar-privacidade/);
});

test("produção aplica cabeçalhos de segurança e bloqueia indexação do dashboard", () => {
  const globalHeaders = vercel.headers.find((entry) => entry.source === "/(.*)")?.headers ?? [];
  const keys = new Set(globalHeaders.map((entry) => entry.key));
  for (const key of [
    "Content-Security-Policy",
    "Referrer-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ]) {
    assert.ok(keys.has(key), `cabeçalho ausente: ${key}`);
  }
  const dashboardHeaders = vercel.headers.find((entry) => entry.source === "/dashboard")?.headers ?? [];
  assert.ok(dashboardHeaders.some((entry) => entry.key === "X-Robots-Tag"));
  assert.ok(dashboardHeaders.some((entry) => entry.key === "Cache-Control" && /no-store/.test(entry.value)));
});

test("textura das páginas legais foi reduzida para rede móvel", async () => {
  const optimized = await stat(
    new URL("../Logo MRC/thumbnail-mrc-optimized.webp", import.meta.url),
  );
  assert.ok(optimized.size < 100_000, `textura ainda pesada: ${optimized.size}`);
});

test("cadastro mantém WhatsApp, atribuição e Meta fora do caminho crítico", () => {
  assert.match(createLead, /Promise\.all\(\[\s*getWhatsappGroupUrl\(supabase\),[\s\S]+check_lead_rate_limit_secure/);
  assert.match(createLead, /runInBackground\(\(async \(\) => \{[\s\S]+enrich_lead_attribution_secure/);
  assert.match(createLead, /runInBackground\([\s\S]+processMetaOutboxBatch/);
  assert.match(edgeConfig, /WHATSAPP_CACHE_TTL_MS/);
  assert.match(edgeConfig, /whatsappCache\.expiresAt > Date\.now\(\)/);
});
