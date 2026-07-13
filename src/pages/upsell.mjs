import { trackEvent } from "../lib/analytics.mjs";
import { trackFunnelEvent } from "../lib/funnel-api.mjs";
import { getLeadReference, getOrCreateSessionId } from "../lib/lead-session.mjs";

const checkoutPlaceholder = "[LINK DO CHECKOUT]";
const leadReference = getLeadReference();
const sessionId = getOrCreateSessionId();

trackEvent("sales_page_viewed", { page: "metodo_referencia_crista" });
trackFunnelEvent("sales_page_viewed", leadReference, sessionId).catch(() => {});

document.querySelectorAll("[data-track]").forEach((target) => {
  target.addEventListener("click", (event) => {
    const eventName = target.dataset.track;
    trackEvent(eventName, {
      page: "metodo_referencia_crista",
      product_price: 297,
    });

    if (eventName === "checkout_initiated" || eventName?.includes("cta")) {
      trackFunnelEvent("checkout_clicked", leadReference, sessionId, {
        timeoutMs: 1_200,
        keepalive: true,
      }).catch(() => {});
    }

    if (target.getAttribute("href") === checkoutPlaceholder) {
      event.preventDefault();
      document
        .querySelector("#checkout")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.alert("Pendente: substitua [LINK DO CHECKOUT] pelo link real do checkout.");
    }
  });
});

const firedMilestones = {};
window.addEventListener(
  "scroll",
  () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const percent = height > 0 ? Math.round((scrollTop / height) * 100) : 0;
    [50, 90].forEach((milestone) => {
      if (percent >= milestone && !firedMilestones[milestone]) {
        firedMilestones[milestone] = true;
        trackEvent(`scroll_${milestone}_percent`, {
          page: "metodo_referencia_crista",
        });
      }
    });
  },
  { passive: true },
);

const carouselRoots = Array.from(document.querySelectorAll("[data-carousel]"));
const meters = Array.from(document.querySelectorAll(".carousel-meter span"));
const slideCount = carouselRoots[0]?.querySelectorAll(".carousel-slide").length ?? 0;
const tones = [
  ["#d6bb93", "rgba(214, 187, 147, 0.2)", "rgba(185, 149, 107, 0.26)"],
  ["#c79567", "rgba(199, 149, 103, 0.18)", "rgba(158, 90, 42, 0.24)"],
  ["#dfc8a4", "rgba(223, 200, 164, 0.18)", "rgba(214, 187, 147, 0.24)"],
  ["#c4a46f", "rgba(196, 164, 111, 0.18)", "rgba(129, 91, 52, 0.26)"],
  ["#d0ad81", "rgba(208, 173, 129, 0.18)", "rgba(115, 76, 54, 0.24)"],
  ["#bd8c5d", "rgba(189, 140, 93, 0.18)", "rgba(149, 80, 42, 0.26)"],
  ["#e0c199", "rgba(224, 193, 153, 0.2)", "rgba(185, 149, 107, 0.3)"],
];
let activeSlide = 0;

function activateSlide(index) {
  if (!slideCount) return;
  activeSlide = (index + slideCount) % slideCount;
  carouselRoots.forEach((root) => {
    root.querySelectorAll(".carousel-slide").forEach((slide, slideIndex) => {
      slide.classList.toggle("is-active", slideIndex === activeSlide);
    });
  });
  meters.forEach((meter, meterIndex) => {
    meter.classList.toggle("is-active", meterIndex === activeSlide);
    if (meterIndex === activeSlide) {
      meter.style.animation = "none";
      void meter.offsetWidth;
      meter.style.animation = "";
    }
  });
  const [accent, soft, glow] = tones[activeSlide % tones.length];
  document.documentElement.style.setProperty("--carousel-accent", accent);
  document.documentElement.style.setProperty("--carousel-soft", soft);
  document.documentElement.style.setProperty("--carousel-glow", glow);
}

activateSlide(0);
if (
  slideCount > 1 &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  window.setInterval(() => activateSlide(activeSlide + 1), 5_800);
}

const upsellSection = document.querySelector("#upsell");
if ("IntersectionObserver" in window && upsellSection) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        trackEvent("upsell_viewed", { page: "metodo_referencia_crista" });
        trackFunnelEvent("upsell_viewed", leadReference, sessionId).catch(() => {});
        observer.disconnect();
      }
    },
    { threshold: 0.35 },
  );
  observer.observe(upsellSection);
}
