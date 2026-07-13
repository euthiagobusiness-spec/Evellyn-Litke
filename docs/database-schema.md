# Modelo de dados

## Tabelas

- `leads`: contato, país/DDI, atribuição, estágio, perfil opcional e referência pública opaca.
- `consents`: histórico imutável de cada escolha e versão da política.
- `funnel_events`: eventos de navegação e conversão; podem ficar anônimos após exclusão do titular.
- `customers`: comprador consolidado e vínculo opcional com lead.
- `products`: produto principal, order bump, upsell e downsell.
- `orders` e `order_items`: transação e composição do pedido.
- `payments`: estados financeiros separados do pedido.
- `webhook_events`: idempotência e auditoria do provedor de pagamento.
- `lead_rate_limits`: proteção interna dos endpoints.

## Regras principais

- E-mail é normalizado e possui índice único; reenvio atualiza o mesmo lead.
- Telefone é persistido em E.164 junto do país e DDI selecionados.
- Nicho, perfil social, tamanho de audiência, principal desafio, objetivo e período de contato são opcionais.
- IDs internos nunca são retornados ao navegador; o fluxo usa `public_reference`.
- Chaves externas, índices de funil e timestamps de atualização são criados por migration.
- Exclusão do lead remove consentimentos e anonimiza seus eventos, mantendo somente métricas sem vínculo pessoal.

## Acesso

RLS está habilitado em todas as tabelas. `anon` e `authenticated` possuem políticas explícitas de negação e não recebem privilégios diretos. Apenas as funções backend chamam os RPCs `capture_lead_secure_v2`, `track_funnel_event_secure` e `check_lead_rate_limit_secure`.

As views de remarketing ficam no schema `private` e usam `security_invoker`.
