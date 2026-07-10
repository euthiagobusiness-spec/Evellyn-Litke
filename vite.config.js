const path = require("node:path");
const { defineConfig } = require("vite");

module.exports = defineConfig({
  build: {
    rollupOptions: {
      input: {
        captura: path.resolve(__dirname, "index.html"),
        upsell: path.resolve(__dirname, "pagina-vendas.html"),
        obrigado: path.resolve(__dirname, "obrigado.html"),
      },
    },
  },
});
