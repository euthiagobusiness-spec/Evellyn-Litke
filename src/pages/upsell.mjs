import { trackEvent } from "../lib/analytics.mjs";
import { trackFunnelEvent } from "../lib/funnel-api.mjs";
import { getLeadReference, getOrCreateSessionId } from "../lib/lead-session.mjs";

const checkoutPlaceholder = "[LINK DO CHECKOUT]";
const leadReference = getLeadReference();
const sessionId = getOrCreateSessionId();

trackEvent("sales_page_viewed", { page: "metodo_referencia_crista" });
trackFunnelEvent("sales_page_viewed", leadReference, sessionId).catch(() => {});
trackEvent("upsell_viewed", { page: "metodo_referencia_crista" });
trackFunnelEvent("upsell_viewed", leadReference, sessionId).catch(() => {});

document.querySelectorAll("[data-track]").forEach((target) => {
  target.addEventListener("click", (event) => {
    const eventName = target.dataset.track;
    trackEvent(eventName, {
      page: "metodo_referencia_crista",
      product_price: 297,
    });
    trackFunnelEvent("checkout_clicked", leadReference, sessionId, {
      timeoutMs: 1_200,
      keepalive: true,
    }).catch(() => {});

    if (target.getAttribute("href") === checkoutPlaceholder) {
      event.preventDefault();
      document.querySelector("#checkout")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      window.alert("O link de pagamento será liberado em breve.");
    }
  });
});
