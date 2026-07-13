# Página de confirmação

A rota canônica é `/obrigado-inscricao` e usa:

- `obrigado.html`: estrutura enxuta e CTA do WhatsApp;
- `funnel.css`: linguagem visual compartilhada com a página de oferta;
- `src/pages/obrigado-inscricao.mjs`: telemetria, link do grupo e carrossel automático.

O navegador recebe apenas a referência pública do lead em `sessionStorage`. Nome, e-mail e telefone não são incluídos na URL.
