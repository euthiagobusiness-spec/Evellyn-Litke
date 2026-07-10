(function () {
  window.dataLayer = window.dataLayer || [];

  function trackEvent(eventName) {
    window.dataLayer.push({
      event: eventName,
      page: "obrigado_whatsapp",
      product: "Metodo Referencia Crista",
    });
  }

  trackEvent("thank_you_page_view");

  document.querySelectorAll("[data-track]").forEach(function (target) {
    target.addEventListener("click", function () {
      trackEvent(target.getAttribute("data-track"));
    });
  });

  var dateSection = document.querySelector(".date-band");

  if ("IntersectionObserver" in window && dateSection) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            trackEvent("event_date_section_view");
            observer.disconnect();
          }
        });
      },
      { threshold: 0.45 },
    );

    observer.observe(dateSection);
  }

  var carouselImages = Array.prototype.slice.call(
    document.querySelectorAll("[data-carousel-image]"),
  );
  var dots = Array.prototype.slice.call(document.querySelectorAll(".carousel-dots span"));
  var slideCount = dots.length;
  var activeSlide = 0;

  function setCarouselSlide(nextSlide) {
    activeSlide = nextSlide % slideCount;
    document.body.dataset.carouselTheme = String(activeSlide);

    carouselImages.forEach(function (image, index) {
      image.classList.toggle("is-active", index % slideCount === activeSlide);
    });

    dots.forEach(function (dot, index) {
      dot.classList.toggle("is-active", index === activeSlide);
    });

    trackEvent("expert_photo_carousel_slide_" + (activeSlide + 1));
  }

  if (slideCount > 1) {
    document.body.dataset.carouselTheme = "0";

    window.setInterval(function () {
      setCarouselSlide(activeSlide + 1);
    }, 4600);
  }
})();
