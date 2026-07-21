# Runbook Dev/Analista - MRC 26/07

Este documento transforma as regras do playbook em uma rotina executável. O dashboard é a fonte de leitura operacional; Supabase é a fonte first-party de leads e redirects; a Meta é a fonte de mídia; a contagem manual do WhatsApp é a fonte de membros líquidos.

## Fluxo oficial

`Anúncio -> captura -> LeadSaved -> RedirectUnique -> WhatsApp -> membro líquido -> presença -> upsell`

- Não publicar o convite do grupo em anúncios ou páginas públicas.
- Não contar cliques repetidos como novas pessoas.
- Não tratar o total do grupo como entradas da campanha.
- Não reintroduzir página de obrigado.

## UTMs obrigatórias

Usar no destino de cada anúncio:

```text
utm_source={{site_source_name}}
utm_medium=paid_social
utm_campaign={{campaign.name}}
utm_content={{ad.name}}
utm_term={{adset.name}}
campaign_id={{campaign.id}}
adset_id={{adset.id}}
ad_id={{ad.id}}
placement={{placement}}
```

Abrir a prévia antes de publicar e confirmar que nenhuma macro chegou como texto literal `{{...}}`. Bio, Reel, Stories, Feed e cada parceiro precisam de `utm_content` próprio.

## Direção de copy por canal

### Página e CTA

- Promessa: deixar de ser invisível e construir autoridade sem negociar princípios.
- Prova de contexto: aula gratuita, online, em 26/07.
- CTA: `Quero minha vaga gratuita para 26/07`.
- Não acrescentar seções longas antes do formulário.

### Anúncio de reconhecimento

- Gancho: `Você tem conhecimento e experiência, mas poucas pessoas reconhecem o valor do que faz?`
- Headline: `Pare de ser invisível no digital.`
- Descrição: `Aula gratuita e online - 26 de julho.`

### Anúncio de valores

- Gancho: `Você não precisa virar personagem ou vender agressivamente para crescer.`
- Headline: `Cresça sem abandonar seus princípios.`
- Descrição: `Inscrição gratuita.`

### Anúncio de mecanismo

- Gancho: `Postar mais não resolve quando sua mensagem não mostra por que você deve ser lembrado.`
- Headline: `Conteúdo com direção gera autoridade.`
- Descrição: `Online - 26 de julho.`

### WhatsApp

- Usar a promessa da página, sem criar benefício novo.
- Priorizar data, horário, preparação e objeção mais votada.
- Não publicar oferta agressiva antes da aula.
- Seguir os textos e a cadência em `docs/operacao-whatsapp-26-07.md`.

## Rotina diária

### 8h - saúde técnica

1. Abrir `/dashboard` com o token restrito.
2. Confirmar erro do formulário, p95 da API, CAPI e cobertura UTM.
3. Fazer um cadastro controlado sem marketing e sem analytics.
4. Confirmar `LeadSaved`, redirect e ausência de CAPI nesse caso.
5. Registrar no dashboard membros totais, administradores e saídas acumuladas.

### 14h - qualidade

1. Importar o CSV agregado da Meta por campanha, conjunto e anúncio.
2. Conciliar leads Meta, leads Supabase e redirects únicos.
3. Tratar qualquer dado ausente como `inconclusivo`, nunca como zero.
4. Não escalar se tracking, UTMs ou grupo ainda estiverem sem leitura confiável.

### 21h - decisão

1. Registrar novo snapshot do grupo.
2. Calcular membros líquidos somente entre dois snapshots comparáveis.
3. Classificar cada anúncio e registrar decisão, motivo, mudança e responsável.
4. Autorizar no máximo uma mudança relevante por hipótese.

## Regras de decisão

- Verde: link CTR >= 1,8%, link CPC <= R$ 0,80, CPL first-party <= R$ 5, pelo menos 3 leads, fontes conciliadas e entrada no grupo medida. Aumentar 20% a 30% após 24h; duplicar o vencedor, sem editar o original.
- Amarelo: link CTR entre 1% e 1,8%, CPL entre R$ 5 e R$ 8, menos de 1.500 impressões ou sinal técnico inconclusivo. Observar mais uma janela e alterar uma variável.
- Vermelho: link CTR < 1% após cerca de 1.500 impressões, gasto > 2x CPL-alvo sem lead, link CPC persistentemente > R$ 1,20-1,50 ou CPL > R$ 8 com amostra. Pausar e substituir por hipótese nova.

Se a Meta mostrar zero e o Supabase receber leads, corrigir mensuração antes de pausar por conversão.

## Alertas de intervenção

- erro do formulário > 2% em 15 minutos;
- 20 cliques no link sem lead novo;
- duas horas sem lead durante tráfego;
- falha CAPI > 5%;
- cobertura UTM < 95%;
- LeadSaved -> RedirectUnique < 90%;
- p95 da API > 2 segundos;
- rota, imagem ou certificado com falha.

## Proteção de dados

- Não exportar PII para planilhas abertas.
- Não publicar prints do WhatsApp com nome, foto ou telefone.
- Usar somente agregados no dashboard.
- Guardar exportações de leads apenas em local restrito e criptografado.
- Processar solicitações LGPD somente após verificação de identidade.
- Rotacionar tokens expostos e nunca inseri-los em Git, PDF, print ou mensagem.
