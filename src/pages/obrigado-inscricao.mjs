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
  trackFunnelEvent(
    "thank_you_registration_viewed",
    leadReference,
    sessionId,
  )
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

const dateSection = document.querySelector(".date-band");
if ("IntersectionObserver" in window && dateSection) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        trackEvent("event_date_section_view", { page: "obrigado_inscricao" });
        observer.disconnect();
      }
    },
    { threshold: 0.45 },
  );
  observer.observe(dateSection);
}

const carouselImages = Array.from(
  document.querySelectorAll("[data-carousel-image]"),
);
const dots = Array.from(document.querySelectorAll(".carousel-dots span"));
let activeSlide = 0;

function setCarouselSlide(nextSlide) {
  if (!dots.length) return;
  activeSlide = nextSlide % dots.length;
  document.body.dataset.carouselTheme = String(activeSlide);
  carouselImages.forEach((image, index) => {
    image.classList.toggle("is-active", index % dots.length === activeSlide);
  });
  dots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === activeSlide);
  });
}

if (
  dots.length > 1 &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  window.setInterval(() => setCarouselSlide(activeSlide + 1), 4_600);
}
