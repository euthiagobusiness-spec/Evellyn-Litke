# LGPD e consentimentos

## Escolhas separadas

- Política de Privacidade: necessária para enviar o cadastro.
- Marketing: opcional, independente e inicialmente desmarcado.
- Analytics: preparado no banco, atualmente não solicitado pelo formulário.

Cada envio gera histórico com tipo, decisão, versão da política, origem, user agent e hash salgado do IP. O IP bruto não é persistido.

## Minimização e segurança

- Nenhuma PII é colocada em query string, rota ou storage persistente do navegador.
- A referência exposta não é o ID interno do lead.
- Dados são gravados somente por Edge Functions.
- As tabelas não são legíveis diretamente pelas chaves públicas.
- A exclusão do titular remove os consentimentos e anonimiza eventos agregados.

## Operação pendente

Antes de campanhas em escala, a controladora deve definir um canal dedicado de privacidade/suporte e uma tabela formal de prazos de retenção por finalidade. A política publicada informa o canal temporário via resposta às comunicações oficiais, sem inventar um endereço inexistente.
