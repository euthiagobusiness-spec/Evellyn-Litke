import "./meta-pixel.mjs";

import { collectFirstPartyEvent } from "./funnel-api.mjs";
import { clearSessionId, getOrCreateSessionId } from "./lead-session.mjs";

const ANALYTICS_CONSENT_KEY = "mrc.analyticsConsent";
const UNIQUE_EVENT_PREFIX = "mrc.event.";

const EVENT_ALIASES = Object.freeze({
  PageView: "LandingView",
  LeadFormStart: "FormStart",
  LeadFormSubmit: "SubmitAttempt",
  Lead: "LeadSaved",
  WhatsAppRedirect: "RedirectStarted",
});

const FIRST_PARTY_EVENTS = new Set([
  "LandingView",
  "FormStart",
  "ValidationError",
  "SubmitAttempt",
  "LeadSaved",
  "RedirectStarted",
  "RedirectUnique",
  "WebVital",
  "ApiRequest",
]);

const SAFE_DETAIL_KEYS = new Set([
  "page",
  "label",
  "field",
  "code",
  "reason",
  "source",
  "status",
  "latencyMs",
  "httpStatus",
  "metric",
  "value",
  "rating",
  "endpoint",
  "durationMs",
  "success",
  "leadReference",
]);

function safeStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeText(value, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return undefined;
  }
  return String(value).trim().slice(0, maxLength);
}

function sanitizedDetails(details) {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key]) => SAFE_DETAIL_KEYS.has(key))
      .map(([key, value]) => [key, safeText(value)])
      .filter(([, value]) => value !== undefined && value !== ""),
  );
}

function attributionFromLocation() {
  if (typeof window === "undefined") return {};
  const query = new URLSearchParams(window.location?.search ?? "");
  const read = (key) => safeText(query.get(key) ?? "", 200) || undefined;
  return {
    source: read("utm_source"),
    medium: read("utm_medium"),
    campaign: read("utm_campaign"),
    content: read("utm_content"),
    term: read("utm_term"),
    campaignId: read("campaign_id"),
    adsetId: read("adset_id"),
    adId: read("ad_id"),
    placement: read("placement"),
  };
}

function isUniqueEvent(eventName) {
  return eventName === "LandingView" || eventName === "FormStart" || eventName === "RedirectUnique";
}

function claimUniqueEvent(eventName, page) {
  if (!isUniqueEvent(eventName)) return true;
  const storage = safeStorage();
  if (!storage) return true;
  const key = `${UNIQUE_EVENT_PREFIX}${eventName}.${page}`;
  if (storage.getItem(key)) return false;
  storage.setItem(key, "1");
  return true;
}

function eventId(eventName) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function hasAnalyticsConsent() {
  return safeLocalStorage()?.getItem(ANALYTICS_CONSENT_KEY) === "granted";
}

export function setAnalyticsConsent(granted) {
  const storage = safeLocalStorage();
  if (storage) {
    if (granted) storage.setItem(ANALYTICS_CONSENT_KEY, "granted");
    else storage.setItem(ANALYTICS_CONSENT_KEY, "denied");
  }
  if (!granted) clearSessionId();
}

export function normalizeFirstPartyEvent(eventName) {
  return EVENT_ALIASES[eventName] ?? eventName;
}

function dispatchFirstParty(eventName, details) {
  const canonicalName = normalizeFirstPartyEvent(eventName);
  if (!FIRST_PARTY_EVENTS.has(canonicalName) || typeof window === "undefined") return;

  const page = safeText(details.page ?? window.location?.pathname ?? "/", 120) || "/";
  if (!claimUniqueEvent(canonicalName, page)) return;

  const consentAnalytics = hasAnalyticsConsent();
  const payload = {
    eventName: canonicalName,
    eventId: eventId(canonicalName),
    occurredAt: new Date().toISOString(),
    page,
    // Um identificador persistente de sessao so nasce depois da escolha
    // afirmativa. Eventos funcionais sem consentimento seguem anonimos.
    sessionId: consentAnalytics ? getOrCreateSessionId() : undefined,
    leadReference: safeText(details.leadReference ?? "", 36) || undefined,
    consentAnalytics,
    utm: attributionFromLocation(),
    ...(canonicalName === "ApiRequest"
      ? { durationMs: Math.max(0, Math.round(Number(details.durationMs) || 0)) }
      : {}),
    metadata: {
      ...sanitizedDetails(details),
      locale: safeText(globalThis.navigator?.language ?? "", 32),
      timezone: safeText(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "", 64),
      viewport: `${Math.max(0, Math.round(window.innerWidth || 0))}x${Math.max(0, Math.round(window.innerHeight || 0))}`,
    },
  };

  collectFirstPartyEvent(payload).catch(() => {
    // Mensuração operacional nunca pode bloquear a conversão.
  });

  if (canonicalName === "RedirectStarted") {
    dispatchFirstParty("RedirectUnique", { ...details, page });
  }
}

export function trackEvent(eventName, details = {}) {
  if (typeof window === "undefined") return;
  const safeDetails = sanitizedDetails(details);
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    timestamp: new Date().toISOString(),
    ...safeDetails,
  });
  dispatchFirstParty(eventName, safeDetails);
}

export function bindTrackedElements(root = document) {
  root.querySelectorAll("[data-track]").forEach((element) => {
    element.addEventListener("click", () => {
      trackEvent(element.dataset.track, {
        label: element.textContent?.trim().slice(0, 120) ?? "",
        page: window.location.pathname,
      });
    });
  });
}

function vitalRating(metric, value) {
  const thresholds = {
    LCP: [2500, 4000],
    CLS: [0.1, 0.25],
    INP: [200, 500],
  }[metric];
  if (!thresholds) return "unknown";
  if (value <= thresholds[0]) return "good";
  if (value <= thresholds[1]) return "needs-improvement";
  return "poor";
}

function reportVital(metric, value) {
  if (!Number.isFinite(value) || value < 0) return;
  const normalized = metric === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value);
  dispatchFirstParty("WebVital", {
    page: window.location?.pathname ?? "/",
    metric,
    value: normalized,
    rating: vitalRating(metric, normalized),
  });
}

function observeWebVitals() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;
  let lcp = null;
  let cls = 0;
  let inp = null;
  const observers = [];

  const observe = (type, callback, options = { type, buffered: true }) => {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe(options);
      observers.push(observer);
    } catch {
      // Navegadores sem suporte seguem com o funil normalmente.
    }
  };

  observe("largest-contentful-paint", (entries) => {
    lcp = entries.at(-1)?.startTime ?? lcp;
  });
  observe("layout-shift", (entries) => {
    cls += entries.filter((entry) => !entry.hadRecentInput).reduce((total, entry) => total + entry.value, 0);
  });
  observe("event", (entries) => {
    const interactions = entries.filter((entry) => entry.interactionId && entry.duration);
    if (interactions.length) inp = Math.max(inp ?? 0, ...interactions.map((entry) => entry.duration));
  }, { type: "event", buffered: true, durationThreshold: 40 });

  let reported = false;
  const flush = () => {
    if (reported) return;
    reported = true;
    if (lcp !== null) reportVital("LCP", lcp);
    reportVital("CLS", cls);
    if (inp !== null) reportVital("INP", inp);
    observers.forEach((observer) => observer.disconnect());
  };
  window.addEventListener?.("pagehide", flush, { once: true });
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  }, { once: true });
}

if (typeof window !== "undefined" && !window.__mrcVitalsObserverInstalled) {
  window.__mrcVitalsObserverInstalled = true;
  observeWebVitals();
  window.addEventListener?.("mrc:api-latency", (event) => {
    dispatchFirstParty("ApiRequest", {
      page: window.location?.pathname ?? "/",
      ...event.detail,
    });
  });
}
