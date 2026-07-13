import { SITE_CONFIG } from "../config.mjs";
import { trackEvent } from "../lib/analytics.mjs";
import { trackFunnelEvent } from "../lib/funnel-api.mjs";
import { getLeadReference, getOrCreateSessionId } from "../lib/lead-session.mjs";

const leadReference = getLeadReference();
const sessionId = getOrCreateSessionId();
const whatsappLinks = document.querySelectorAll("[data-whatsapp-link]");

function setWhatsappUrl(url) {
  whatsappLinks.forEach((link) => {
    link.href = url;
  });
}

setWhatsappUrl(SITE_CONFIG.whatsappGroupUrl);
trackEvent("thank_you_page_view", { page: "obrigado_inscricao" });

if (leadReference) {
  trackFunnelEvent("thank_you_registration_viewed", leadReference, sessionId)
    .then((result) => {
      if (result?.whatsappUrl) setWhatsappUrl(result.whatsappUrl);
    })
    .catch(() => {
      // Telemetry cannot block access to the WhatsApp group.
    });
}

whatsappLinks.forEach((link) => {
  link.addEventListener("click", () => {
    trackEvent(link.dataset.track ?? "whatsapp_clicked", {
      page: "obrigado_inscricao",
    });
    trackFunnelEvent("whatsapp_clicked", leadReference, sessionId, {
      timeoutMs: 1_200,
      keepalive: true,
    }).catch(() => {
      // The new tab opens immediately even if analytics is unavailable.
    });
  });
});

const carouselImages = Array.from(document.querySelectorAll("[data-carousel-image]"));
let activeSlide = 0;

function setCarouselSlide(index) {
  if (!carouselImages.length) return;
  activeSlide = index % carouselImages.length;
  carouselImages.forEach((image, imageIndex) => {
    image.classList.toggle("is-active", imageIndex === activeSlide);
  });
}

if (
  carouselImages.length > 1 &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  window.setInterval(() => setCarouselSlide(activeSlide + 1), 4_800);
}
