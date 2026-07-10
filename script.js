(function () {
  var checkoutPlaceholder = "[LINK DO CHECKOUT]";
  var trackingTargets = document.querySelectorAll("[data-track]");

  trackingTargets.forEach(function (target) {
    target.addEventListener("click", function () {
      var eventName = target.getAttribute("data-track");

      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: eventName,
        page: "metodo_referencia_crista",
        product_price: 297
      });

      if (target.getAttribute("href") === checkoutPlaceholder) {
        event.preventDefault();
        document.querySelector("#checkout").scrollIntoView({ behavior: "smooth", block: "start" });
        window.alert("Pendente: substitua [LINK DO CHECKOUT] pelo link real do checkout.");
      }
    });
  });

  var scrollMilestones = [50, 90];
  var fired = {};

  window.addEventListener("scroll", function () {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var percent = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;

    scrollMilestones.forEach(function (milestone) {
      if (percent >= milestone && !fired[milestone]) {
        fired[milestone] = true;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: "scroll_" + milestone + "_percent",
          page: "metodo_referencia_crista"
        });
      }
    });
  }, { passive: true });

  var carouselRoots = Array.prototype.slice.call(document.querySelectorAll("[data-carousel]"));
  var thumbs = Array.prototype.slice.call(document.querySelectorAll("[data-carousel-thumb]"));
  var meters = Array.prototype.slice.call(document.querySelectorAll(".carousel-meter span"));
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var slideCount = carouselRoots.length
    ? carouselRoots[0].querySelectorAll(".carousel-slide").length
    : 0;
  var activeSlide = 0;
  var carouselTimer = null;
  var intervalMs = 5800;
  var tones = [
    { accent: "#d6bb93", soft: "rgba(214, 187, 147, 0.2)", glow: "rgba(185, 149, 107, 0.26)" },
    { accent: "#c79567", soft: "rgba(199, 149, 103, 0.18)", glow: "rgba(158, 90, 42, 0.24)" },
    { accent: "#dfc8a4", soft: "rgba(223, 200, 164, 0.18)", glow: "rgba(214, 187, 147, 0.24)" },
    { accent: "#c4a46f", soft: "rgba(196, 164, 111, 0.18)", glow: "rgba(129, 91, 52, 0.26)" },
    { accent: "#d0ad81", soft: "rgba(208, 173, 129, 0.18)", glow: "rgba(115, 76, 54, 0.24)" },
    { accent: "#bd8c5d", soft: "rgba(189, 140, 93, 0.18)", glow: "rgba(149, 80, 42, 0.26)" },
    { accent: "#e0c199", soft: "rgba(224, 193, 153, 0.2)", glow: "rgba(185, 149, 107, 0.3)" }
  ];

  function setCarouselTone(index) {
    var tone = tones[index % tones.length];
    document.documentElement.style.setProperty("--carousel-accent", tone.accent);
    document.documentElement.style.setProperty("--carousel-soft", tone.soft);
    document.documentElement.style.setProperty("--carousel-glow", tone.glow);
  }

  function activateSlide(index) {
    if (!slideCount) {
      return;
    }

    activeSlide = (index + slideCount) % slideCount;

    carouselRoots.forEach(function (root) {
      var slides = root.querySelectorAll(".carousel-slide");
      slides.forEach(function (slide, slideIndex) {
        slide.classList.toggle("is-active", slideIndex === activeSlide);
      });
    });

    thumbs.forEach(function (thumb, thumbIndex) {
      var isActive = thumbIndex === activeSlide;
      thumb.classList.toggle("is-active", isActive);
      thumb.setAttribute("aria-current", isActive ? "true" : "false");
    });

    meters.forEach(function (meter, meterIndex) {
      meter.classList.toggle("is-active", meterIndex === activeSlide);
      if (meterIndex === activeSlide) {
        meter.style.animation = "none";
        void meter.offsetWidth;
        meter.style.animation = "";
      }
    });

    setCarouselTone(activeSlide);

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "expert_carousel_slide",
      page: "metodo_referencia_crista",
      slide_index: activeSlide + 1
    });
  }

  function startCarousel() {
    if (reducedMotion || !slideCount) {
      return;
    }

    window.clearInterval(carouselTimer);
    carouselTimer = window.setInterval(function () {
      activateSlide(activeSlide + 1);
    }, intervalMs);
  }

  thumbs.forEach(function (thumb) {
    thumb.addEventListener("click", function () {
      var index = Number(thumb.getAttribute("data-carousel-thumb"));
      activateSlide(index);
      startCarousel();
    });
  });

  activateSlide(0);
  startCarousel();
})();
