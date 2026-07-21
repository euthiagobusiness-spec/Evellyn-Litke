# Configuração do Supabase

Projeto atual: `Evellyn-Litke` (`zsrgdjzouhykatrypdmr`). As migrations em `supabase/migrations` são a fonte de verdade.

## Aplicar banco e validar

```powershell
npx supabase@latest link --project-ref SEU_PROJECT_REF
npx supabase@latest db push
npx supabase@latest migration list
npx supabase@latest db advisors --type security
npx supabase@latest db advisors --type performance
```

O ambiente local requer Docker Desktop. Sem Docker, use uma branch de banco do Supabase antes da produção. Não execute DDL avulso no projeto principal.

## Edge Functions

```powershell
npx supabase@latest functions deploy create-lead --no-verify-jwt
npx supabase@latest functions deploy track-funnel-event --no-verify-jwt
npx supabase@latest functions deploy collect-funnel-event --no-verify-jwt
npx supabase@latest functions deploy privacy-request --no-verify-jwt
npx supabase@latest functions deploy funnel-dashboard --no-verify-jwt
npx supabase@latest functions deploy process-meta-outbox --no-verify-jwt
```

`verify_jwt=false` é intencional: captura, eventos e solicitações LGPD recebem visitantes anônimos; dashboard/worker usam autenticação própria. Todas as funções ainda aplicam validação server-side, allowlist de origem, limite de payload e least privilege.

## Secrets

Obrigatórios:

- `SITE_URL=https://www.eventomrc.com.br`
- `ALLOWED_ORIGINS=https://eventomrc.com.br,https://www.eventomrc.com.br`
- `WHATSAPP_GROUP_URL`: convite oficial opcional como Edge Secret. Na operação atual, o convite fica em `private.funnel_settings` e é lido somente por `service_role`.
- `PRIVACY_POLICY_VERSION`: versão visível ao titular.
- `IP_HASH_SALT`: valor aleatório com pelo menos 24 caracteres.

Meta CAPI:

- `META_PIXEL_ID`
- `META_CONVERSIONS_API_TOKEN`
- `META_GRAPH_API_VERSION` (padrão de compatibilidade: `v23.0`; mantenha explícito e revise antes de cada lançamento)
- `CAPI_WORKER_TOKEN`: token opaco com 32+ caracteres para o processador agendado.

O token CAPI que já apareceu em conversa, log ou documento deve ser revogado e substituído. Nunca use segredo em `VITE_*`, HTML, JavaScript do navegador ou migration.

Dashboard:

- Gere um token criptograficamente forte fora do banco.
- Armazene somente SHA-256 em `private.dashboard_access_tokens`.
- Nunca use token plaintext em variável pública, HTML ou Git.

Para cadastrar um acesso rotacionável, calcule SHA-256 localmente e insira apenas o hash:

```sql
insert into private.dashboard_access_tokens (token_hash, label, expires_at)
values ('HASH_SHA256_DE_64_HEXADECIMAIS', 'gestor-trafego', now() + interval '30 days');
```

Para revogar:

```sql
update private.dashboard_access_tokens
set active = false
where token_hash = 'HASH_SHA256_DE_64_HEXADECIMAIS';
```

## Contratos

### `create-lead`

Recebe `idempotencyKey` e `eventId` UUID, além do formulário, consentimentos e atribuição. Também aceita `X-Idempotency-Key`. Retorna:

```json
{
  "success": true,
  "leadReference": "uuid-opaco",
  "leadAction": "created",
  "eventId": "uuid-compartilhado-com-o-pixel",
  "conversionEligible": true,
  "whatsappUrl": "convite-retornado-somente-apos-cadastro-valido",
  "idempotentReplay": false
}
```

### `collect-funnel-event`

POST público, sem PII:

```json
{
  "eventName": "LandingView",
  "eventId": "uuid",
  "leadReference": null,
  "sessionId": "uuid-da-sessao",
  "page": "/",
  "occurredAt": "2026-07-20T12:00:00.000Z",
  "utm": { "source": "facebook", "campaign": "campanha" },
  "metadata": { "viewport": "390x844", "locale": "pt-BR" },
  "consentAnalytics": false,
  "website": ""
}
```

Eventos públicos: `LandingView`, `FormStart`, `ValidationError`, `SubmitAttempt`, `LeadSaved`, `RedirectStarted`, `RedirectUnique`, `WebVital` e `ApiRequest`.

### `funnel-dashboard`

`Authorization: Bearer <token>`.

- GET `?days=7`: retorna `summary`, `funnel`, `daily`, `campaigns`, `health`, `groupSnapshots` e `alerts`, sempre agregados.
- POST `{ "action":"group_snapshot", "count":77, "note":"21h" }`.
- POST `{ "action":"import_meta", "rows":[...] }` com dados agregados por dia/campanha/anúncio.

### `privacy-request`

POST público:

```json
{
  "requestType": "access",
  "name": "Nome do titular",
  "email": "titular@example.com",
  "phoneE164": "+5592999999999",
  "details": "Informações adicionais",
  "consentPrivacy": true,
  "website": ""
}
```

`requestType`: `access`, `correction`, `deletion`, `withdrawal` ou `portability`. Retorna `requestReference` e nunca entrega dados antes da verificação de identidade.

## Worker CAPI

`create-lead` tenta processar o próprio evento em background. Para retries, agende `process-meta-outbox` a cada minuto. A documentação oficial recomenda `pg_cron` + `pg_net`, com URL/token guardados no Supabase Vault. Não grave o worker token dentro do texto do cron.

Depois de aplicar a migration, confira `pending`, `retry` e `dead` no dashboard e mantenha a taxa de falha abaixo de 5%.
