import { callFunction, FunnelApiError } from "../lib/funnel-api.mjs";

const form = document.querySelector("[data-privacy-request]");
const status = document.querySelector("[data-request-status]");

function messageFor(error) {
  if (!(error instanceof FunnelApiError)) return "Não foi possível enviar agora. Tente novamente.";
  if (error.code === "rate_limit_exceeded") return "Limite de solicitações atingido. Tente novamente amanhã.";
  if (error.code === "network_error" || error.message === "request_timeout") return "Sua conexão falhou. Verifique a internet e tente novamente.";
  if (error.field === "email") return "Informe um e-mail válido.";
  if (error.field === "consentPrivacy") return "Aceite o tratamento necessário para enviar a solicitação.";
  return "Não foi possível registrar a solicitação. Tente novamente em instantes.";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const button = form.querySelector("button[type='submit']");
  const data = new FormData(form);
  button.disabled = true;
  status.classList.remove("is-error");
  status.textContent = "Registrando sua solicitação com segurança...";

  try {
    const response = await callFunction("privacy-request", {
      requestType: data.get("requestType"),
      name: data.get("name"),
      email: data.get("email"),
      details: data.get("details") || null,
      consentPrivacy: data.get("consentPrivacy") === "on",
      website: data.get("website") || "",
    });
    form.reset();
    status.textContent = `Solicitação registrada. Protocolo: ${response.requestReference}. Guarde esta referência.`;
  } catch (error) {
    status.classList.add("is-error");
    status.textContent = messageFor(error);
  } finally {
    button.disabled = false;
  }
});
