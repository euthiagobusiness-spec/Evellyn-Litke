# LGPD, consentimentos e proteção de dados

## Escolhas independentes

- Política de Privacidade: necessária para concluir o cadastro.
- Marketing: opcional, desmarcado por padrão e independente da captura.
- Analytics/medição: opcional, desmarcado por padrão e independente de marketing.

Recusar marketing ou analytics não bloqueia a inscrição. Cada envio registra uma fotografia da decisão, versão da política, página, data, user agent e hash salgado do IP. O IP bruto não é gravado em `consents`.

O evento CAPI é enfileirado somente quando analytics/medição foi autorizado. Marketing controla comunicações futuras; não deve ser usado como substituto do consentimento de medição.

## Minimização

- Nenhuma PII vai em query string, UTM, rota, localStorage ou evento first-party.
- O navegador recebe somente a referência pública opaca do lead.
- Metadados de eventos usam allowlist.
- Tabelas não são legíveis por `anon` ou `authenticated`.
- Service role, token Meta e tokens de dashboard existem somente no backend.
- Logs recebem códigos técnicos, nunca nome, e-mail, telefone, payload do formulário ou resposta integral da Meta.

Eventos operacionais sem analytics não guardam session ID nem hash do IP. A controladora ainda deve validar e documentar a base legal de interesse legítimo/RIPD para essa medição minimizada antes da campanha em escala.

## Direitos do titular

O endpoint `privacy-request` recebe pedidos de acesso, correção, exclusão, revogação e portabilidade. O fluxo é:

1. registrar `requestReference` com status `pending_verification`;
2. confirmar identidade por canal controlado, sem pedir senha ou documento no formulário público;
3. mudar o status para `verified` por operação administrativa;
4. exportar/corrigir/excluir apenas depois da verificação;
5. registrar conclusão e data.

`get_data_subject_export_secure(reference)` e `delete_verified_data_subject_secure(reference, note)` são RPCs exclusivos de `service_role`. Nunca exponha essas operações diretamente ao navegador.

## Retenção

Métricas anônimas e operacionais possuem prazos técnicos configurados. Leads não são apagados automaticamente: a controladora deve decidir e documentar finalidade, prazo, obrigação legal e eventual `legal_hold`.

Antes de exclusão em lote:

1. preencher `retention_until` apenas após validação jurídica;
2. executar `preview_lead_retention_secure()`;
3. revisar bloqueios legais e clientes/pedidos vinculados;
4. fazer backup e registrar responsável;
5. executar a exclusão administrativa explícita.

## Pendências organizacionais

- definir e publicar canal do encarregado/controladora;
- definir SLA interno para direitos do titular;
- registrar operadores com acesso ao Supabase e ao dashboard;
- revisar o RIPD e a base legal da medição operacional;
- rotacionar tokens expostos e revisar acessos ao final do lançamento;
- manter snapshot do grupo sem extrair lista de membros por automação não autorizada.
