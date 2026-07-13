const META_PIXEL_ID = "888359477674276";
const MARKETING_CONSENT_KEY = "mrc.marketingConsent";

function hasWindow() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readConsent() {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(MARKETING_CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

function writeConsent(granted) {
  if (!hasWindow()) return;
  try {
    if (granted) window.localStorage.setItem(MARKETING_CONSENT_KEY, "granted");
    else window.localStorage.removeItem(MARKETING_CONSENT_KEY);
  } catch {
    // O funil continua funcionando quando o armazenamento está indisponível.
  }
}

function installPixelRuntime() {
  if (window.fbq) return;

  const fbq = function (...args) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  };
  window.fbq = fbq;
  window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.append(script);
}

function prepareMetaPixel() {
  if (!hasWindow()) return false;
  installPixelRuntime();
  if (!window.__mrcMetaPixelInitialized) {
    window.fbq("consent", readConsent() ? "grant" : "revoke");
    window.fbq("init", META_PIXEL_ID);
    window.__mrcMetaPixelInitialized = true;
  }
  return true;
}

export function initMetaPixel() {
  if (!prepareMetaPixel() || !readConsent()) return false;

  window.fbq("consent", "grant");
  if (!window.__mrcMetaPageViewTracked) {
    window.fbq("track", "PageView");
    window.__mrcMetaPageViewTracked = true;
  }
  return true;
}

export function setMetaMarketingConsent(granted) {
  writeConsent(Boolean(granted));
  prepareMetaPixel();
  if (granted) initMetaPixel();
  else window.fbq?.("consent", "revoke");
}

export function trackMetaLead(leadReference) {
  if (!leadReference || !initMetaPixel()) return;
  window.fbq("track", "Lead", {}, {
    eventID: `${leadReference}:lead`,
  });
}

prepareMetaPixel();
initMetaPixel();
