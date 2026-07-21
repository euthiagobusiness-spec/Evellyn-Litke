# Funil Evellyn Litke

Projeto único e modular com captura de leads, página de oferta e documentos legais. O front-end é estático (Vite/Vercel) e toda operação privilegiada acontece em Edge Functions do Supabase.

## Rotas

- `/` e `/captura`: página de captura
- `/upsell`: página de oferta
- `/politica-de-privacidade` e `/termos-de-uso`: documentos legais

As páginas não são ligadas por uma navegação principal. Depois que o Supabase confirma a gravação, o formulário encaminha o lead diretamente ao grupo oficial do WhatsApp. As antigas rotas `/obrigado` e `/obrigado-inscricao` não expõem mais o convite.

## Desenvolvimento

```powershell
npm install
npm run dev
```

O servidor local usa `http://127.0.0.1:8000`. Para validar tudo:

```powershell
npm run check
```

## Organização

- `src/pages`: inicialização de cada página
- `src/lib`: API, validação, países/DDIs, analytics, sessão e carrossel
- `src/types`: tipos gerados do banco
- `supabase/migrations`: schema e segurança versionados
- `supabase/functions`: endpoints seguros de captura e eventos
- `docs`: arquitetura, setup, LGPD, segmentos e testes

## Configuração

O navegador não recebe `service_role` nem secret key. A URL pública do projeto está centralizada em `src/config.mjs`; uma substituição opcional pode ser feita com `VITE_SUPABASE_URL`, conforme `.env.example`.

Os secrets de backend ficam no Supabase: `SITE_URL`, `ALLOWED_ORIGINS`, `WHATSAPP_GROUP_URL`, `PRIVACY_POLICY_VERSION`, `IP_HASH_SALT`, `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN` e, opcionalmente, `TURNSTILE_SECRET_KEY`/`META_GRAPH_API_VERSION`.

Consulte [docs/supabase-setup.md](docs/supabase-setup.md) para implantação completa.

## Checkout externo da Imersão

A página `/upsell` registra o interesse dos leads conhecidos antes de encaminhá-los ao checkout. Configure `VITE_UPSELL_CHECKOUT_URL` na Vercel com a URL pública do checkout externo. Enquanto essa variável não estiver configurada, os botões permanecem na página e informam que o link será disponibilizado em breve.
