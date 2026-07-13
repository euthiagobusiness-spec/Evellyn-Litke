# Fluxo de captura

1. O visitante acessa `/captura` e preenche nome, e-mail e telefone com DDI.
2. O navegador valida os campos e exige apenas o aceite da Política de Privacidade; marketing permanece opcional e desmarcado.
3. `create-lead` repete a validação, verifica origem, honeypot, payload, CAPTCHA opcional e rate limit.
4. O telefone é normalizado para E.164 e o e-mail para minúsculas.
5. O RPC faz upsert atômico, registra consentimentos e cria o evento de captura.
6. A resposta contém somente uma referência UUID opaca, guardada em `sessionStorage`.
7. Somente após sucesso o navegador abre `/obrigado-inscricao`.
8. A página registra a visualização e o clique no WhatsApp sem colocar PII na URL.

Falhas de rede ou backend mantêm o usuário no formulário, reabilitam o botão e exibem mensagem amigável. Duplo clique é bloqueado no cliente e a deduplicação também ocorre no banco.
