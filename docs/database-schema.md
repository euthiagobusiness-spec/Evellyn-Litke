# Modelo de dados do funil MRC

## Contato e atribuição

- `leads`: dados de contato normalizados, país/DDI, perfil opcional e referência pública opaca.
- `first_touch`: atribuição original imutável. Os campos UTM legados também preservam a primeira origem.
- `last_touch`: atribuição da visita/captura mais recente.
- `lead_submissions`: chave de idempotência e resultado original. Repetir a mesma requisição não duplica lead, consentimento nem conversão.
- `retention_until` e `legal_hold`: suportam decisão de retenção por lead sem exclusão automática.

E-mail é normalizado com trim/lowercase e possui índice único. Telefone é validado no Edge Runtime com `libphonenumber-js` e salvo em E.164. Reenvio com o mesmo e-mail atualiza contato e `last_touch`, incrementa `submission_count` e retorna `lead_action=updated`.

## Consentimento e direitos do titular

- `consents`: histórico append-only de privacidade, marketing por e-mail, marketing por WhatsApp e analytics; cada registro contém decisão, versão, página, data, user agent e hash salgado do IP.
- `data_subject_requests`: pedidos de acesso, correção, exclusão, revogação e portabilidade.
- `data_retention_policies`: catálogo de prazos e bases operacionais. Prazo de lead ativo permanece sem valor até decisão documentada da controladora.

Pedidos LGPD começam como `pending_verification`. Exportação e exclusão exigem verificação de identidade fora do fluxo público. A exclusão verificada remove o lead e seus consentimentos, elimina jobs CAPI e anonimiza eventos agregados por `ON DELETE SET NULL`.

## Medição first-party

- `funnel_events`: `landing_view`, `form_start`, `validation_error`, `submit_attempt`, `lead_saved`, `redirect_started`, `redirect_unique`, `web_vital` e `api_request`, além dos eventos legados.
- `event_id` é único e torna eventos idempotentes.
- `redirect_unique` possui unicidade por lead.
- Sem consentimento de analytics, o backend descarta IP hash e session ID do evento; mantém somente o marco operacional minimizado.
- Metadados têm allowlist e nunca aceitam nome, e-mail ou telefone.
- `api_request_metrics`: status e latência dos endpoints sem PII.

## Meta CAPI e operações

- `meta_event_outbox`: fila transacional do evento `Lead`, usando o mesmo `event_id` do navegador.
- O cadastro responde depois do `LeadSaved`; a chamada ao Meta roda em background.
- Jobs usam `pending -> processing -> sent`, ou `retry -> dead`, com backoff e no máximo seis tentativas.
- O corpo de resposta da Meta não é armazenado. Ficam somente status HTTP, código técnico, latência e contagem de tentativas.
- O IP bruto, quando permitido por consentimento de analytics, existe somente enquanto uma tentativa pode ser repetida; é apagado em `sent`/`dead` e, independentemente do estado, após 24 horas.
- `group_member_snapshots`: contagens manuais do grupo.
- `meta_campaign_daily`: importação agregada do Meta Ads, sem PII.
- `private.dashboard_access_tokens`: somente SHA-256 de tokens do dashboard; plaintext nunca é persistido.

## Segurança

Todas as tabelas em `public` têm RLS habilitado, política restritiva para `anon`/`authenticated` e privilégios públicos revogados. RPCs `SECURITY DEFINER` usam `search_path=''`, têm `EXECUTE` revogado de `PUBLIC` e são concedidos apenas a `service_role`. A tabela de tokens fica no schema não exposto `private`.

O dashboard usa apenas `get_funnel_dashboard_secure(days)`, que retorna agregados. Nenhuma rota de dashboard retorna linhas de leads.

## Retenção

`run_retention_secure()` remove métricas anônimas, rate limits, outbox já finalizada, IP transitório do outbox e submissões órfãs conforme o catálogo. Não apaga leads. `preview_lead_retention_secure()` mostra quantos estão elegíveis, sob bloqueio ou sem decisão. A exclusão por prazo exige chamada administrativa explícita com `delete_expired_leads_secure('DELETE_EXPIRED_LEADS')`.
