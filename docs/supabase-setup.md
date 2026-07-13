# Configuração do Supabase

Projeto atual: `Evellyn-Litke` (`zsrgdjzouhykatrypdmr`).

## Banco

As migrations em `supabase/migrations` são a fonte de verdade. Para um novo ambiente:

```powershell
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Não execute DDL manual fora de migrations. Depois de qualquer mudança, gere novamente os tipos e rode os advisors de segurança/performance.

## Edge Functions

Endpoints publicados:

- `create-lead`: valida, normaliza, limita tentativas, grava o lead e os consentimentos.
- `track-funnel-event`: registra etapas do funil usando somente a referência pública opaca do lead.

Deploy em outro projeto:

```powershell
npx supabase functions deploy create-lead --no-verify-jwt
npx supabase functions deploy track-funnel-event --no-verify-jwt
```

As funções são públicas porque recebem visitantes anônimos, mas aplicam allowlist de origem, limite de payload, validação server-side, honeypot, rate limit persistente e acesso ao banco apenas pelo backend.

## Secrets obrigatórios

Para conversões server-side do Meta Ads, configure também no painel do Supabase:

- `META_PIXEL_ID`: ID do Pixel.
- `META_CONVERSIONS_API_TOKEN`: token da Conversions API.
- `META_GRAPH_API_VERSION` (opcional): versão da Graph API; padrão `v20.0`.

O `create-lead` envia o evento `Lead` somente quando há consentimento de marketing. E-mail, telefone, nome, país e referência pública são normalizados e submetidos com SHA-256; o token nunca chega ao navegador.

- `SITE_URL`: URL principal de produção.
- `ALLOWED_ORIGINS`: URLs adicionais separadas por vírgula.
- `WHATSAPP_GROUP_URL`: convite oficial.
- `PRIVACY_POLICY_VERSION`: versão exibida ao titular.
- `IP_HASH_SALT`: segredo aleatório longo; não versionar.

Opcional: `TURNSTILE_SECRET_KEY`. Quando configurado, o front-end também deve enviar `turnstileToken`.

O Supabase injeta `SUPABASE_URL` e a credencial privilegiada no runtime. Nunca use credencial privilegiada em `VITE_*`, HTML ou JavaScript entregue ao navegador.

## Vercel

```powershell
npm run check
npx vercel@latest deploy --prod --yes
```

Depois do deploy, inclua qualquer novo domínio em `ALLOWED_ORIGINS` antes de testar a captura.
