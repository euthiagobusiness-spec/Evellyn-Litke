import { bindTrackedElements, trackEvent } from "../lib/analytics.mjs";
import { initCaptureCarousel } from "../lib/capture-carousel.mjs";
import {
  getSelectedCountry,
  normalizeCallingCode,
  populateCountrySelect,
} from "../lib/country-codes.mjs";
import { callFunction, FunnelApiError } from "../lib/funnel-api.mjs";
import { getOrCreateSessionId, saveLeadReference } from "../lib/lead-session.mjs";
import {
  setMetaMarketingConsent,
  trackMetaLead,
} from "../lib/meta-pixel.mjs";
import {
  formatPhoneInput,
  validateLeadFields,
} from "../lib/lead-validation.mjs";

const form = document.querySelector("[data-lead-form]");
const status = form?.querySelector(".submit-status");
const submitButton = form?.querySelector('button[type="submit"]');
const countrySelect = form?.querySelector('[name="countryIso"]');
const customDdiWrap = form?.querySelector("[data-custom-ddi]");
const customDdiInput = form?.querySelector('[name="customDdi"]');
const phoneInput = form?.querySelector('[name="phone"]');
const sessionId = getOrCreateSessionId();
let submitting = false;
let formStarted = false;

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
  if (showErrors) {
    ["name", "email", "phone", "consentPrivacy"].forEach((field) => {
      setFieldError(field, result.errors[field] ?? "");
    });
  }
  submitButton.disabled = submitting || !result.valid;
  return result;
}

function attribution() {
  const query = new URLSearchParams(window.location.search);
  const read = (key) => query.get(key);
  return {
    utmSource: read("utm_source"),
    utmMedium: read("utm_medium"),
    utmCampaign: read("utm_campaign"),
    utmContent: read("utm_content"),
    utmTerm: read("utm_term"),
    gclid: read("gclid"),
    fbclid: read("fbclid"),
    referrer: document.referrer || null,
    landingPath: window.location.pathname,
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
trackEvent("PageView", { page: "captura" });

if (form) {
  populateCountrySelect(countrySelect);
  syncCountryFields();

  form.addEventListener("input", (event) => {
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
    validate();
  });

  countrySelect?.addEventListener("change", () => {
    syncCountryFields();
    validate();
  });

  form.addEventListener(
    "blur",
    (event) => {
      if (event.target?.name) validate({ showErrors: true });
    },
    true,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;

    const result = validate({ showErrors: true });
    if (!result.valid) {
      status.textContent = "Revise os campos destacados.";
      status.classList.add("is-error");
      return;
    }

    submitting = true;
    validate();
    const originalText = submitButton.textContent;
    submitButton.textContent = "Salvando sua inscrição...";
    status.textContent = "Estamos confirmando seus dados com segurança.";
    status.classList.remove("is-error");

    const data = new FormData(form);
    const country = getSelectedCountry(countrySelect, data.get("customDdi"));
    const consentMarketing = data.get("consentMarketing") === "on";
    try {
      const response = await callFunction("create-lead", {
        name: result.normalized.name,
        email: result.normalized.email,
        phone: result.normalized.phoneE164,
        countryIso: country.iso,
        countryCallingCode: country.callingCode,
        businessStage: data.get("businessStage") || null,
        goal: data.get("goal") || null,
        niche: data.get("niche") || null,
        instagramHandle: data.get("instagramHandle") || null,
        audienceSize: data.get("audienceSize") || null,
        biggestChallenge: data.get("biggestChallenge") || null,
        preferredContactPeriod: data.get("preferredContactPeriod") || null,
        consentPrivacy: true,
        consentMarketing,
        consentAnalytics: false,
        website: data.get("website") || "",
        sessionId,
        ...attribution(),
        metadata: {
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          fbc: cookieValue("_fbc"),
          fbp: cookieValue("_fbp"),
        },
      });

      saveLeadReference(response.leadReference);
      setMetaMarketingConsent(consentMarketing);
      if (consentMarketing) trackMetaLead(response.leadReference);
      trackEvent("Lead", { page: "captura" });
      status.textContent = "Inscrição confirmada. Redirecionando...";
      window.location.assign(form.dataset.nextPath);
    } catch (error) {
      status.textContent = humanError(error);
      status.classList.add("is-error");
      submitting = false;
      submitButton.textContent = originalText;
      validate();
    }
  });

  validate();
}
