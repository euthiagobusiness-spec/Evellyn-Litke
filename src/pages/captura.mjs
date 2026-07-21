import {
  bindTrackedElements,
  setAnalyticsConsent,
  trackEvent,
} from "../lib/analytics.mjs";
import { initCaptureCarousel } from "../lib/capture-carousel.mjs";
import {
  getSelectedCountry,
  normalizeCallingCode,
  populateCountrySelect,
} from "../lib/country-codes.mjs";
import {
  callFunction,
  FunnelApiError,
  trackFunnelEvent,
} from "../lib/funnel-api.mjs";
import { getOrCreateSessionId, saveLeadReference } from "../lib/lead-session.mjs";
import {
  setMetaMeasurementConsent,
  trackMetaLead,
} from "../lib/meta-pixel.mjs";
import {
  formatPhoneInput,
  validateLeadFields,
} from "../lib/lead-validation.mjs";

const form = document.querySelector("[data-lead-form]");
const status = form?.querySelector(".submit-status");
const submitButton = form?.querySelector('button[type="submit"]');
const whatsappFallback = form?.querySelector("[data-whatsapp-fallback]");
const countrySelect = form?.querySelector('[name="countryIso"]');
const customDdiWrap = form?.querySelector("[data-custom-ddi]");
const customDdiInput = form?.querySelector('[name="customDdi"]');
const phoneInput = form?.querySelector('[name="phone"]');
let submitting = false;
let formStarted = false;
let activeSubmission = null;

function randomUuid() {
  return globalThis.crypto?.randomUUID?.()
    ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
}

function currentFields() {
  const data = new FormData(form);
  const country = getSelectedCountry(countrySelect, data.get("customDdi"));
  return {
    name: data.get("name"),
    email: data.get("email"),
    phone: data.get("phone"),
    countryIso: country.iso,
    countryCallingCode: country.callingCode,
    consentPrivacy: data.get("consentPrivacy") === "on",
  };
}

function syncCountryFields() {
  const country = getSelectedCountry(countrySelect, customDdiInput?.value);
  customDdiWrap?.toggleAttribute("hidden", !country.custom);
  if (customDdiInput) {
    customDdiInput.required = country.custom;
    customDdiInput.value = country.custom
      ? normalizeCallingCode(customDdiInput.value)
      : "";
  }
  if (phoneInput) {
    phoneInput.placeholder = country.callingCode === "+55"
      ? "(DDD) 99999-9999"
      : "Número com código de área";
    phoneInput.value = formatPhoneInput(phoneInput.value, country.callingCode);
  }
}

function setFieldError(field, message = "") {
  const input = form.elements.namedItem(field);
  const error = form.querySelector(`[data-error-for="${field}"]`);
  if (input instanceof HTMLElement) {
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }
  if (error) error.textContent = message;
}

function validate({ showErrors = false } = {}) {
  const result = validateLeadFields(currentFields());
  ["name", "email", "phone", "consentPrivacy"].forEach((field) => {
    const message = result.errors[field] ?? "";
    if (showErrors || !message) setFieldError(field, message);
  });
  submitButton.disabled = submitting || !result.valid;
  return result;
}

function attribution() {
  const query = new URLSearchParams(window.location.search);
  const read = (key) => query.get(key);
  let safeReferrer = null;
  try {
    const referrer = new URL(document.referrer);
    safeReferrer = `${referrer.origin}${referrer.pathname}`;
  } catch {
    // Referrer vazio ou invalido nao interfere no cadastro.
  }
  return {
    utmSource: read("utm_source"),
    utmMedium: read("utm_medium") ?? read("placement"),
    utmCampaign: read("utm_campaign") ?? read("campaign_id"),
    utmContent: read("utm_content") ?? read("ad_id"),
    utmTerm: read("utm_term") ?? read("adset_id"),
    campaignId: read("campaign_id"),
    adsetId: read("adset_id"),
    adId: read("ad_id"),
    placement: read("placement"),
    gclid: read("gclid"),
    fbclid: read("fbclid"),
    referrer: safeReferrer,
    landingPath: window.location.pathname,
    landingUrl: `${window.location.origin}${window.location.pathname}`,
  };
}

function cookieValue(name) {
  return document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`))?.split("=").slice(1).join("=") || null;
}

function humanError(error) {
  if (!(error instanceof FunnelApiError)) {
    return "Não foi possível concluir agora. Tente novamente.";
  }
  if (error.code === "rate_limit_exceeded") {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  if (error.code === "captcha_failed") {
    return "Não foi possível validar o envio. Atualize a página e tente novamente.";
  }
  if (error.code === "network_error" || error.message === "request_timeout") {
    return "Verifique sua conexão e tente novamente.";
  }
  return "Não foi possível salvar sua inscrição. Tente novamente em instantes.";
}

initCaptureCarousel(trackEvent);
bindTrackedElements();
// O formulário nasce com as duas escolhas opcionais recusadas. Isso evita
// reutilizar uma decisão antiga enquanto a interface atual está desmarcada.
setAnalyticsConsent(false);
setMetaMeasurementConsent(false);
trackEvent("PageView", { page: "captura" });

if (form) {
  populateCountrySelect(countrySelect);
  syncCountryFields();

  form.addEventListener("input", (event) => {
    if (!submitting) activeSubmission = null;
    if (!formStarted) {
      formStarted = true;
      trackEvent("LeadFormStart", { page: "captura" });
    }

    if (event.target?.name === "phone") {
      const country = getSelectedCountry(countrySelect, customDdiInput?.value);
      event.target.value = formatPhoneInput(event.target.value, country.callingCode);
    }
    if (event.target?.name === "customDdi") {
      event.target.value = normalizeCallingCode(event.target.value);
    }
    if (event.target?.name === "consentAnalytics") {
      const granted = event.target.checked === true;
      setAnalyticsConsent(granted);
      setMetaMeasurementConsent(granted);
    }
    validate();
  });

  countrySelect?.addEventListener("change", () => {
    syncCountryFields();
    validate();
  });

  form.addEventListener(
    "blur",
    (event) => {
      if (!event.target?.name) return;
      // Blur valida apenas a interface. ValidationError fica reservado para
      // uma tentativa real de envio invalida, evitando taxas acima de 100%.
      validate({ showErrors: true });
    },
    true,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;

    trackEvent("LeadFormSubmit", { page: "captura" });

    const result = validate({ showErrors: true });
    if (!result.valid) {
      trackEvent("ValidationError", {
        page: "captura",
        field: Object.keys(result.errors)[0] ?? "form",
        code: "invalid_or_required",
      });
      status.textContent = "Revise os campos destacados.";
      status.classList.add("is-error");
      return;
    }

    submitting = true;
    validate();
    submitButton.textContent = "Confirmando sua inscrição...";
    status.textContent = "Estamos confirmando seus dados com segurança.";
    status.classList.remove("is-error");

    const data = new FormData(form);
    const country = getSelectedCountry(countrySelect, data.get("customDdi"));
    const consentMarketing = data.get("consentMarketing") === "on";
    const consentAnalytics = data.get("consentAnalytics") === "on";
    const sessionId = consentAnalytics ? getOrCreateSessionId() : null;
    const leadAttribution = attribution();
    activeSubmission ??= {
      idempotencyKey: randomUuid(),
      eventId: randomUuid(),
    };
    try {
      const response = await callFunction("create-lead", {
        ...activeSubmission,
        name: result.normalized.name,
        email: result.normalized.email,
        phone: result.normalized.phoneE164,
        countryIso: country.iso,
        countryCallingCode: country.callingCode,
        consentPrivacy: true,
        consentMarketing,
        consentAnalytics,
        website: data.get("website") || "",
        sessionId,
        ...leadAttribution,
        metadata: {
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          campaignId: leadAttribution.campaignId,
          adsetId: leadAttribution.adsetId,
          adId: leadAttribution.adId,
          placement: leadAttribution.placement,
          landingUrl: leadAttribution.landingUrl,
          ...(consentAnalytics
            ? { fbc: cookieValue("_fbc"), fbp: cookieValue("_fbp") }
            : {}),
        },
      });

      saveLeadReference(response.leadReference);
      setAnalyticsConsent(consentAnalytics);
      setMetaMeasurementConsent(consentAnalytics);
      // O mesmo eventId segue no Pixel e na CAPI para a deduplicacao da Meta.
      if (consentAnalytics && response.conversionEligible !== false) {
        trackMetaLead(response.eventId);
      }
      trackEvent("WhatsAppRedirect", {
        page: "captura",
        leadReference: response.leadReference,
      });
      status.textContent = "Inscrição confirmada. Abrindo o grupo oficial...";
      if (whatsappFallback) {
        whatsappFallback.href = response.whatsappUrl || "";
        whatsappFallback.hidden = !response.whatsappUrl;
      }
      trackFunnelEvent(
        "whatsapp_clicked",
        response.leadReference,
        sessionId,
        {
          timeoutMs: 1_200,
          keepalive: true,
        },
      ).catch(() => {
        // A telemetria nunca deve impedir o acesso ao grupo.
      });
      if (response.whatsappUrl) {
        window.location.assign(response.whatsappUrl);
      } else {
        status.textContent = "Inscri\u00e7\u00e3o salva, mas o acesso ao grupo est\u00e1 temporariamente indispon\u00edvel.";
        status.classList.add("is-error");
      }
    } catch (error) {
      status.textContent = humanError(error);
      status.classList.add("is-error");
      submitting = false;
      submitButton.textContent = "Tentar novamente";
      validate();
    }
  });

  validate();
}
