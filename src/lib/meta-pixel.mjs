const META_PIXEL_ID = "888359477674276";
const MEASUREMENT_CONSENT_KEY = "mrc.adsMeasurementConsent";

function hasWindow() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readConsent() {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(MEASUREMENT_CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

function writeConsent(granted) {
  if (!hasWindow()) return;
  try {
    if (granted) window.localStorage.setItem(MEASUREMENT_CONSENT_KEY, "granted");
    else window.localStorage.removeItem(MEASUREMENT_CONSENT_KEY);
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
  if (!hasWindow() || !readConsent()) return false;
  installPixelRuntime();
  if (!window.__mrcMetaPixelInitialized) {
    window.fbq("consent", "grant");
    window.fbq("init", META_PIXEL_ID);
    window.__mrcMetaPixelInitialized = true;
  }
  return true;
}

export function initMetaPixel() {
  if (!readConsent() || !prepareMetaPixel()) return false;

  window.fbq("consent", "grant");
  if (!window.__mrcMetaPageViewTracked) {
    window.fbq("track", "PageView");
    window.__mrcMetaPageViewTracked = true;
  }
  return true;
}

export function hasMetaMeasurementConsent() {
  return readConsent();
}

export function setMetaMeasurementConsent(granted) {
  writeConsent(Boolean(granted));
  if (granted) {
    initMetaPixel();
  } else if (hasWindow()) {
    window.fbq?.("consent", "revoke");
  }
}

export function trackMetaLead(eventId) {
  if (!eventId || !initMetaPixel()) return;
  window.fbq("track", "Lead", {}, {
    eventID: eventId,
  });
}

// Cada visita exige uma nova escolha visivel; nenhuma opcao facultativa nasce marcada.
writeConsent(false);
initMetaPixel();
