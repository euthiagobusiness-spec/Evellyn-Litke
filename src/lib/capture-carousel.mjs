const SLIDES = [
  { position: "center 36%", glow: "rgba(199, 170, 125, 0.3)", wash: "rgba(112, 63, 61, 0.16)" },
  { position: "center 30%", glow: "rgba(214, 178, 126, 0.32)", wash: "rgba(141, 111, 77, 0.16)" },
  { position: "center 25%", glow: "rgba(228, 210, 184, 0.26)", wash: "rgba(102, 115, 95, 0.14)" },
  { position: "center 18%", glow: "rgba(199, 170, 125, 0.24)", wash: "rgba(112, 63, 61, 0.14)" },
  { position: "center 20%", glow: "rgba(213, 146, 79, 0.24)", wash: "rgba(141, 111, 77, 0.16)" },
  { position: "center 20%", glow: "rgba(213, 146, 79, 0.25)", wash: "rgba(112, 63, 61, 0.15)" },
  { position: "center 35%", glow: "rgba(199, 170, 125, 0.31)", wash: "rgba(102, 115, 95, 0.13)" },
];

export function initCaptureCarousel(trackEvent) {
  const images = document.querySelectorAll("[data-carousel-image]");
  const sources = document.querySelectorAll("[data-carousel-source]");
  const progress = document.querySelector(".carousel-progress span");
  if (!images.length || !sources.length) return;

  const slides = Array.from(sources, (image, index) => ({
    ...SLIDES[index % SLIDES.length],
    src: image.currentSrc || image.src,
    alt: image.alt,
  }));
  let activeSlide = 0;
  let requestId = 0;

  slides.forEach((slide) => {
    const preload = new Image();
    preload.src = slide.src;
  });

  function resetProgress() {
    if (!progress) return;
    progress.style.animation = "none";
    void progress.offsetHeight;
    progress.style.animation = "";
  }

  function setSlide(nextIndex) {
    const index = (nextIndex + slides.length) % slides.length;
    const slide = slides[index];
    const currentRequest = ++requestId;
    const preload = new Image();

    preload.onload = () => {
      if (currentRequest !== requestId) return;
      images.forEach((image) => image.classList.add("is-changing"));
      window.setTimeout(() => {
        if (currentRequest !== requestId) return;
        images.forEach((image) => {
          image.src = slide.src;
          image.alt = slide.alt;
          image.style.objectPosition = slide.position;
          image.classList.remove("is-changing");
        });
        document.documentElement.style.setProperty("--photo-glow", slide.glow);
        document.documentElement.style.setProperty("--photo-wash", slide.wash);
        activeSlide = index;
        resetProgress();
        trackEvent("CarouselSlide", { slide_index: index + 1 });
      }, 560);
    };

    preload.onerror = () => {
      images.forEach((image) => image.classList.remove("is-changing"));
      trackEvent("CarouselImageError", { slide_index: index + 1 });
    };
    preload.src = slide.src;
  }

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.setInterval(() => setSlide(activeSlide + 1), 5_800);
  }
}
