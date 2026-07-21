import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../src/pages/captura.mjs", import.meta.url), "utf8");
const viteConfig = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
const vercelConfig = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);

test("captura apresenta somente a experiência compacta solicitada", () => {
  assert.match(html, /Pare de Ser Invisível na Internet\./);
  assert.match(html, /Descubra Como Cristãos Estão Se Tornando/);
  assert.match(html, /Participe da aula gratuita e descubra o método/);
  assert.match(html, /<form data-lead-form novalidate>/);
  assert.match(html, /Quero minha vaga gratuita para 26\/07/);
  assert.match(html, /name="consentPrivacy"/);
  assert.match(html, /name="consentMarketing"/);
  assert.match(html, /name="consentAnalytics"/);
  assert.doesNotMatch(html, /name="consent(?:Marketing|Analytics)"[^>]*checked/);
  assert.match(html, /data-country-search/);
  assert.doesNotMatch(html, /Personalizar minha experiência/);
  assert.doesNotMatch(html, /data-carousel-source/);
  assert.doesNotMatch(html, /data-next-path/);

  for (const removedContent of [
    "Esta aula é para você",
    "O que você vai aprender",
    "Sobre a expert",
    "Quem é Evellyn Litke",
  ]) {
    assert.doesNotMatch(html, new RegExp(removedContent, "i"));
  }
});

test("hero usa formatos responsivos e mantém o fallback desktop abaixo de 250 KB", async () => {
  for (const width of [360, 480, 768, 1086]) {
    assert.match(html, new RegExp(`evellyn-hero-${width}\\.avif`));
    assert.match(html, new RegExp(`evellyn-hero-${width}\\.webp`));
  }

  const fallback = await stat(
    new URL("../assets/portraits/evellyn-hero-1086.webp", import.meta.url),
  );
  assert.ok(fallback.size >= 150_000, `fallback muito comprimido: ${fallback.size}`);
  assert.ok(fallback.size <= 250_000, `fallback acima de 250 KB: ${fallback.size}`);
});

test("cadastro confirmado segue direto ao WhatsApp sem página intermediária", () => {
  assert.match(script, /setAnalyticsConsent\(false\);[\s\S]*setMetaMeasurementConsent\(false\);[\s\S]*trackEvent\("PageView"/);
  assert.match(script, /trackFunnelEvent\(\s*"whatsapp_clicked"/);
  assert.match(script, /window\.location\.assign\(response\.whatsappUrl\)/);
  assert.doesNotMatch(html, /chat\.whatsapp\.com/);
  assert.doesNotMatch(script, /dataset\.nextPath/);
  assert.doesNotMatch(viteConfig, /obrigado\.html/);

  assert.equal(vercelConfig.redirects, undefined);
});
