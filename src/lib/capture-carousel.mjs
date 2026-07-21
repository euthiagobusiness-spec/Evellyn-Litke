const SLIDES = [
  {
    src: new URL("../../assets/portraits/evellyn-hero-1086.webp", import.meta.url).href,
    alt: "Evellyn Litke sorrindo em ensaio profissional",
    position: "center 36%",
    glow: "rgba(199, 170, 125, 0.3)",
  },
  {
    src: new URL("../../assets/portraits/evellyn-slide-2-960.webp", import.meta.url).href,
    alt: "Evellyn Litke em retrato sorrindo",
    position: "center 30%",
    glow: "rgba(214, 178, 126, 0.32)",
  },
  {
    src: new URL("../../assets/portraits/evellyn-slide-3-960.webp", import.meta.url).href,
    alt: "Evellyn Litke escrevendo em um caderno",
    position: "center 25%",
    glow: "rgba(228, 210, 184, 0.26)",
  },
  {
    src: new URL("../../assets/portraits/evellyn-slide-4-960.webp", import.meta.url).href,
    alt: "Retrato profissional de Evellyn Litke",
    position: "center 18%",
    glow: "rgba(199, 170, 125, 0.24)",
  },
  {
    src: new URL("../../assets/portraits/evellyn-slide-5-960.webp", import.meta.url).href,
    alt: "Evellyn Litke em foto profissional de corpo inteiro",
    position: "center 20%",
    glow: "rgba(213, 146, 79, 0.24)",
  },
  {
    src: new URL("../../assets/portraits/evellyn-slide-6-960.webp", import.meta.url).href,
    alt: "Evellyn Litke em pose profissional de corpo inteiro",
    position: "center 20%",
    glow: "rgba(213, 146, 79, 0.25)",
  },
  {
    src: new URL("../../assets/portraits/evellyn-slide-7-960.webp", import.meta.url).href,
    alt: "Evellyn Litke sorrindo em estúdio",
    position: "center 35%",
    glow: "rgba(199, 170, 125, 0.31)",
  },
];

const DESKTOP_QUERY = "(min-width: 981px)";
const ROTATION_INTERVAL = 5_800;

export function initCaptureCarousel(trackEvent = () => {}) {
  const image = document.querySelector("[data-carousel-image]");
  const picture = document.querySelector("[data-carousel-picture]");
  const progress = document.querySelector(".carousel-progress span");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const desktop = window.matchMedia(DESKTOP_QUERY).matches;
  const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;

  // Mobile, reduced-motion and data-saving visitors keep the optimized static hero.
  if (!image || !picture || !desktop || reducedMotion || connection?.saveData) return;

  let activeSlide = 0;
  let requestId = 0;
  let intervalId = 0;
  let responsiveSourcesRemoved = false;

  function resetProgress() {
    if (!progress) return;
    progress.style.animation = "none";
    void progress.offsetHeight;
    progress.style.animation = "";
  }

  function removeResponsiveSources() {
    if (responsiveSourcesRemoved) return;
    picture.querySelectorAll("source").forEach((source) => source.remove());
    image.removeAttribute("srcset");
    responsiveSourcesRemoved = true;
  }

  function setSlide(nextIndex) {
    if (document.hidden) return;
    const index = (nextIndex + SLIDES.length) % SLIDES.length;
    const slide = SLIDES[index];
    const currentRequest = ++requestId;
    const nextImage = new Image();
    nextImage.decoding = "async";

    nextImage.onload = () => {
      if (currentRequest !== requestId) return;
      image.classList.add("is-changing");
      window.setTimeout(() => {
        if (currentRequest !== requestId) return;
        removeResponsiveSources();
        image.src = slide.src;
        image.alt = slide.alt;
        image.style.objectPosition = slide.position;
        image.classList.remove("is-changing");
        document.documentElement.style.setProperty("--photo-glow", slide.glow);
        activeSlide = index;
        resetProgress();
        trackEvent("CarouselSlide", { slide_index: index + 1 });
      }, 420);
    };

    nextImage.onerror = () => {
      image.classList.remove("is-changing");
      trackEvent("CarouselImageError", { slide_index: index + 1 });
    };
    nextImage.src = slide.src;
  }

  function startRotation() {
    if (intervalId) return;
    intervalId = window.setInterval(() => setSlide(activeSlide + 1), ROTATION_INTERVAL);
  }

  function stopRotation() {
    if (!intervalId) return;
    window.clearInterval(intervalId);
    intervalId = 0;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopRotation();
    else startRotation();
  });

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(startRotation, { timeout: 2_500 });
  } else {
    window.setTimeout(startRotation, 1_500);
  }
}
