import { SITE_CONFIG } from "../config.mjs";
import { trackEvent } from "../lib/analytics.mjs";
import { trackFunnelEvent } from "../lib/funnel-api.mjs";
import { getLeadReference, getOrCreateSessionId } from "../lib/lead-session.mjs";

const leadReference = getLeadReference();
const sessionId = getOrCreateSessionId();
const checkoutUrl = SITE_CONFIG.upsellCheckoutUrl;
const checkoutStatus = document.querySelector("[data-checkout-status]");
const ctas = document.querySelectorAll("[data-upsell-cta]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

trackEvent("upsell_viewed", { page: "imersao_referencia_crista" });
trackFunnelEvent("upsell_viewed", leadReference, sessionId).catch(() => {});

function configureCheckoutLink(link) {
  if (checkoutUrl) {
    link.href = checkoutUrl;
    link.rel = "noopener";
    return;
  }

  link.href = "#participar";
  link.setAttribute("aria-describedby", "checkout-pending-message");
}

function showPendingCheckoutMessage() {
  if (!checkoutStatus) return;
  checkoutStatus.id = "checkout-pending-message";
  checkoutStatus.hidden = false;
  checkoutStatus.textContent = "O link externo da inscrição será disponibilizado em breve.";
}

ctas.forEach((cta) => {
  configureCheckoutLink(cta);

  cta.addEventListener("click", (event) => {
    trackEvent(cta.dataset.track, { page: "imersao_referencia_crista" });
    trackFunnelEvent("checkout_clicked", leadReference, sessionId, {
      timeoutMs: 1_200,
      keepalive: true,
    }).catch(() => {});

    if (!checkoutUrl) {
      event.preventDefault();
      document.querySelector("#participar")?.scrollIntoView({
        behavior: reducedMotion.matches ? "auto" : "smooth",
        block: "center",
      });
      showPendingCheckoutMessage();
    }
  });

  cta.addEventListener("pointermove", (event) => {
    if (reducedMotion.matches || event.pointerType !== "mouse") return;
    const bounds = cta.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const magnetX = ((x / bounds.width) - 0.5) * 8;
    const magnetY = ((y / bounds.height) - 0.5) * 6;

    cta.style.setProperty("--pointer-x", `${x}px`);
    cta.style.setProperty("--pointer-y", `${y}px`);
    cta.style.setProperty("--magnet-x", `${magnetX}px`);
    cta.style.setProperty("--magnet-y", `${magnetY}px`);
  });

  cta.addEventListener("pointerleave", () => {
    cta.style.removeProperty("--magnet-x");
    cta.style.removeProperty("--magnet-y");
  });
});
