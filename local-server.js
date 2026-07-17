// Servidor usado somente para desenvolvimento local.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8000);
const projectRoot = __dirname;

const pageRoutes = new Map([
  ["/", "index.html"],
  ["/captura", "index.html"],
  ["/captura/", "index.html"],
  ["/upsell", "pagina-vendas.html"],
  ["/upsell/", "pagina-vendas.html"],
  ["/politica-de-privacidade", "politica-de-privacidade.html"],
  ["/politica-de-privacidade/", "politica-de-privacidade.html"],
  ["/termos-de-uso", "termos-de-uso.html"],
  ["/termos-de-uso/", "termos-de-uso.html"],
]);

const externalRedirects = new Map([
  ["/obrigado", "https://chat.whatsapp.com/J6IZBsPjpgwCR8u3mEn5jt"],
  ["/obrigado/", "https://chat.whatsapp.com/J6IZBsPjpgwCR8u3mEn5jt"],
  ["/obrigado-inscricao", "https://chat.whatsapp.com/J6IZBsPjpgwCR8u3mEn5jt"],
  ["/obrigado-inscricao/", "https://chat.whatsapp.com/J6IZBsPjpgwCR8u3mEn5jt"],
]);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendFile(response, filePath) {
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Página não encontrada.");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || host}`).pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Requisição inválida.");
    return;
  }

  const externalRedirect = externalRedirects.get(pathname);
  if (externalRedirect) {
    response.writeHead(302, { Location: externalRedirect });
    response.end();
    return;
  }

  const routedPage = pageRoutes.get(pathname);
  if (routedPage) {
    sendFile(response, path.join(projectRoot, routedPage));
    return;
  }

  const requestedPath = path.resolve(projectRoot, `.${pathname}`);
  if (!requestedPath.startsWith(`${projectRoot}${path.sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Acesso negado.");
    return;
  }

  sendFile(response, requestedPath);
});

server.listen(port, host, () => {
  console.log(`Funil disponível em http://${host}:${port}`);
  console.log(`Captura:  http://${host}:${port}/`);
  console.log(`Upsell:   http://${host}:${port}/upsell`);
  console.log("Pós-cadastro: redirecionamento direto ao grupo do WhatsApp");
});
