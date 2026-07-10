# Funil Evellyn Litke

Projeto único com três páginas independentes servidas pelo mesmo localhost.

## Iniciar

```powershell
npm run dev
```

O servidor usa `http://127.0.0.1:8000` por padrão. Para escolher outra porta:

```powershell
$env:PORT=3000; npm run dev
```

## Rotas

- Captura: `http://127.0.0.1:8000/` (também responde em `/captura`)
- Upsell: `http://127.0.0.1:8000/upsell`
- Obrigado: `http://127.0.0.1:8000/obrigado`

As rotas de upsell e obrigado não aparecem na navegação da página de captura. O formulário de captura encaminha o lead diretamente para `/obrigado` após o envio.

## Arquivos das páginas

- `index.html`: página de captura
- `pagina-vendas.html`: página de upsell
- `obrigado.html`: página de obrigado

## Deploy na Vercel

O arquivo `vercel.json` publica o projeto como site estático e preserva as mesmas rotas usadas no localhost. O arquivo `local-server.js` existe somente para desenvolvimento local e não é usado como função de produção.

## Pendências de conteúdo e integrações

Os placeholders entre colchetes ainda precisam receber os links e conteúdos finais, incluindo checkout, grupo de WhatsApp, política de privacidade, termos e suporte.
