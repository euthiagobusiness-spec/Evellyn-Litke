export function trackEvent(eventName, details = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

export function bindTrackedElements(root = document) {
  root.querySelectorAll("[data-track]").forEach((element) => {
    element.addEventListener("click", () => {
      trackEvent(element.dataset.track, {
        label: element.textContent?.trim().slice(0, 120) ?? "",
      });
    });
  });
}
