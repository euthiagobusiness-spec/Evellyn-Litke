import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const captureSource = await readFile(new URL("../src/pages/captura.mjs", import.meta.url), "utf8");

test("separa consentimento de mensuracao, nao rastreia antes dele e deduplica o Lead", async () => {
  const storage = new Map();
  const appended = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };
  globalThis.document = {
    createElement: () => ({}),
    head: { append: (element) => appended.push(element) },
  };

  try {
    const pixel = await import(`../src/lib/meta-pixel.mjs?test=${Date.now()}`);
    assert.equal(appended.length, 0);
    assert.equal(window.fbq, undefined);

    assert.equal(pixel.hasMetaMeasurementConsent(), false);
    pixel.setMetaMeasurementConsent(true);
    assert.equal(pixel.hasMetaMeasurementConsent(), true);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].src, "https://connect.facebook.net/en_US/fbevents.js");
    assert.deepEqual(window.fbq.queue[0], ["consent", "grant"]);
    assert.deepEqual(window.fbq.queue[1], ["init", "888359477674276"]);
    assert.deepEqual(window.fbq.queue[2], ["consent", "grant"]);
    assert.deepEqual(window.fbq.queue[3], ["track", "PageView"]);

    pixel.trackMetaLead("c8708884-7b6a-4b4e-9933-52491025c35e");
    assert.deepEqual(window.fbq.queue[5], [
      "track",
      "Lead",
      {},
      { eventID: "c8708884-7b6a-4b4e-9933-52491025c35e" },
    ]);

    pixel.setMetaMeasurementConsent(false);
    assert.equal(pixel.hasMetaMeasurementConsent(), false);
    assert.deepEqual(window.fbq.queue.at(-1), ["consent", "revoke"]);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});

test("captura revoga consentimentos antigos antes do primeiro PageView", () => {
  const analyticsReset = captureSource.indexOf("setAnalyticsConsent(false)");
  const metaReset = captureSource.indexOf("setMetaMeasurementConsent(false)");
  const firstPageView = captureSource.indexOf('trackEvent("PageView"');
  assert.ok(analyticsReset >= 0 && analyticsReset < firstPageView);
  assert.ok(metaReset >= 0 && metaReset < firstPageView);
});
