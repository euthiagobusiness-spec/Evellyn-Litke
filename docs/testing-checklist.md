# Checklist de testes

## Automático

```powershell
npm run check
```

Valida telefone/e-mail/consentimento e executa o build Vite.

## Captura

- Botão começa desabilitado e não aceita dois envios simultâneos.
- Telefone sem DDI e e-mail inválido mostram erro.
- Marketing pode ficar desmarcado.
- Falha do backend não redireciona.
- Sucesso abre `/obrigado-inscricao` sem PII na URL.
- Mesmo e-mail com outra capitalização atualiza um único lead.

## Segurança

- Origem fora da allowlist recebe 403.
- Payload acima de 12 KB e content-type inválido são rejeitados.
- Honeypot não grava lead.
- Mais de cinco capturas por IP/15 min recebe 429.
- `anon` e `authenticated` não possuem leitura direta das tabelas.
- Supabase Security Advisor não apresenta erro ou alerta.

## Funil

- Visualização da confirmação muda o estágio para `registered`.
- Clique no WhatsApp grava timestamp e estágio `whatsapp`.
- Visualização da oferta e checkout geram seus eventos.
- Exclusão de lead remove consentimentos e deixa eventos anônimos.
