import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../pagina-vendas.html", import.meta.url), "utf8");
const script = await readFile(new URL("../src/pages/upsell.mjs", import.meta.url), "utf8");

test("upsell apresenta somente a oferta compacta da Imersão", () => {
  assert.match(html, /Você deu o primeiro passo para construir sua autoridade/);
  assert.match(html, /Vídeo pendente/);
  assert.match(html, /3 dias de consultoria ao vivo via Zoom/);
  assert.equal((html.match(/Quero participar da imersão/g) ?? []).length, 2);

  for (const removedContent of [
    "R$ 297",
    "Tudo o que você precisa para sair do improviso",
    "Antes de decidir",
    "Capa produto MRC.png",
    "Oferta para inscritos",
  ]) {
    assert.doesNotMatch(html, new RegExp(removedContent));
  }
});

test("upsell registra interesse sem enviar preço", () => {
  assert.match(script, /trackFunnelEvent\("checkout_clicked"/);
  assert.doesNotMatch(script, /product_price/);
});
