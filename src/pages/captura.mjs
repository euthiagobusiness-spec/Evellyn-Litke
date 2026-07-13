import { bindTrackedElements, trackEvent } from "../lib/analytics.mjs";
import { initCaptureCarousel } from "../lib/capture-carousel.mjs";
import { callFunction, FunnelApiError } from "../lib/funnel-api.mjs";
import { getOrCreateSessionId, saveLeadReference } from "../lib/lead-session.mjs";
import {
  formatPhoneInput,
  validateLeadFields,
} from "../lib/lead-validation.mjs";

const form = document.querySelector("[data-lead-form]");
const status = form?.querySelector(".submit-status");
const submitButton = form?.querySelector('button[type="submit"]');
const sessionId = getOrCreateSessionId();
let submitting = false;
let formStarted = false;

function currentFields() {
  const data = new FormData(form);
  return {
    name: data.get("name"),
    email: data.get("email"),
    phone: data.get("phone"),
    consentPrivacy: data.get("consentPrivacy") === "on",
  };
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
  form.addEventListener("input", (event) => {
    if (!formStarted) {
      formStarted = true;
      trackEvent("LeadFormStart", { page: "captura" });
    }

    if (event.target?.name === "phone") {
      event.target.value = formatPhoneInput(event.target.value);
    }
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
    try {
      const response = await callFunction("create-lead", {
        name: result.normalized.name,
        email: result.normalized.email,
        phone: data.get("phone"),
        businessStage: data.get("businessStage") || null,
        goal: data.get("goal") || null,
        consentPrivacy: true,
        consentMarketing: data.get("consentMarketing") === "on",
        consentAnalytics: false,
        website: data.get("website") || "",
        sessionId,
        ...attribution(),
        metadata: {
          locale: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      });

      saveLeadReference(response.leadReference);
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
