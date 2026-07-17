import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("cadastro confirmado segue direto ao WhatsApp sem página intermediária", () => {
  assert.match(script, /trackFunnelEvent\("whatsapp_clicked"/);
  assert.match(script, /window\.location\.assign\(SITE_CONFIG\.whatsappGroupUrl\)/);
  assert.doesNotMatch(script, /dataset\.nextPath/);
  assert.doesNotMatch(viteConfig, /obrigado\.html/);

  const legacyRedirects = vercelConfig.redirects.filter((redirect) =>
    ["/obrigado", "/obrigado-inscricao"].includes(redirect.source),
  );
  assert.equal(legacyRedirects.length, 2);
  assert.ok(
    legacyRedirects.every(
      (redirect) => redirect.destination === "https://chat.whatsapp.com/J6IZBsPjpgwCR8u3mEn5jt",
    ),
  );
});
