import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const analyticsSource = await readFile(new URL("../src/lib/analytics.mjs", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../src/lib/funnel-api.mjs", import.meta.url), "utf8");

test("telemetria leve cobre Core Web Vitals e latência sem dependência externa", () => {
  assert.match(analyticsSource, /largest-contentful-paint/);
  assert.match(analyticsSource, /layout-shift/);
  assert.match(analyticsSource, /reportVital\("INP"/);
  assert.match(analyticsSource, /"WebVital"/);
  assert.match(apiSource, /mrc:api-latency/);
  assert.match(apiSource, /durationMs/);
  assert.doesNotMatch(analyticsSource, /web-vitals|@sentry|newrelic/i);
});

test("analytics first-party normaliza, deduplica e nunca envia PII", async () => {
  const local = new Map();
  const session = new Map();
  const requests = [];
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalFetch = globalThis.fetch;

  globalThis.window = {
    localStorage: {
      getItem: (key) => local.get(key) ?? null,
      setItem: (key, value) => local.set(key, value),
      removeItem: (key) => local.delete(key),
    },
    sessionStorage: {
      getItem: (key) => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
      removeItem: (key) => session.delete(key),
    },
    location: {
      pathname: "/captura",
      search: "?utm_source=meta&utm_campaign=MRC_TESTE&ad_id=123",
    },
    innerWidth: 390,
    innerHeight: 844,
    setTimeout,
    clearTimeout,
  };
  globalThis.document = {
    createElement: () => ({}),
    head: { append: () => {} },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "pt-BR" },
  });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const analytics = await import(`../src/lib/analytics.mjs?test=${Date.now()}`);
    analytics.trackEvent("PageView", { page: "captura", email: "nao@enviar.test" });
    analytics.trackEvent("PageView", { page: "captura" });
    analytics.trackEvent("LeadFormStart", { page: "captura", phone: "+559999999999" });
    analytics.trackEvent("WhatsAppRedirect", { page: "captura", name: "Pessoa Teste" });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(requests.map(({ body }) => body.eventName), [
      "LandingView",
      "FormStart",
      "RedirectStarted",
      "RedirectUnique",
    ]);
    assert.equal(requests[0].body.consentAnalytics, false);
    assert.equal(requests[0].body.sessionId, undefined);
    assert.equal(session.has("mrc.sessionId"), false);
    assert.equal(requests[0].body.utm.source, "meta");
    assert.equal(requests[0].body.utm.adId, "123");
    assert.match(requests[0].body.eventId, /^[0-9a-f-]{36}$/i);
    const serialized = JSON.stringify(requests);
    assert.doesNotMatch(serialized, /nao@enviar|559999999999|Pessoa Teste/);

    analytics.setAnalyticsConsent(true);
    analytics.trackEvent("ValidationError", { page: "captura", field: "phone", email: "oculto@test" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(requests.at(-1).body.consentAnalytics, true);
    assert.match(requests.at(-1).body.sessionId, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(requests.at(-1).body.metadata.field, "phone");

    analytics.setAnalyticsConsent(false);
    assert.equal(local.get("mrc.analyticsConsent"), "denied");
    assert.equal(session.has("mrc.sessionId"), false);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    globalThis.fetch = originalFetch;
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
});
