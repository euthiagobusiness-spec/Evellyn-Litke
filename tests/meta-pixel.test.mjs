import assert from "node:assert/strict";
import test from "node:test";

test("carrega o Meta Pixel somente após consentimento e deduplica o Lead", async () => {
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

    pixel.setMetaMarketingConsent(true);
    assert.equal(appended.length, 1);
    assert.equal(appended[0].src, "https://connect.facebook.net/en_US/fbevents.js");
    assert.deepEqual(window.fbq.queue[0], ["init", "888359477674276"]);
    assert.deepEqual(window.fbq.queue[1], ["track", "PageView"]);

    pixel.trackMetaLead("lead-reference");
    assert.deepEqual(window.fbq.queue[2], [
      "track",
      "Lead",
      {},
      { eventID: "lead-reference:lead" },
    ]);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
