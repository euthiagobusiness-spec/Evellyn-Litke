# Fluxo de captura

1. O visitante acessa `/captura` e preenche nome, e-mail e telefone; Brasil (`+55`) vem selecionado por padrão e o país pode ser alterado.
2. Dados de perfil e segmentação ficam em um bloco recolhível e são totalmente opcionais.
3. O navegador valida os campos e exige apenas o aceite da Política de Privacidade; marketing permanece opcional e desmarcado.
4. `create-lead` repete a validação, verifica origem, honeypot, payload, CAPTCHA opcional e rate limit.
5. O telefone é normalizado para E.164 e o e-mail para minúsculas.
6. O RPC faz upsert atômico, registra dados opcionais, consentimentos e o evento de captura.
7. A resposta contém somente uma referência UUID opaca, guardada em `sessionStorage`.
8. Somente após sucesso o navegador registra o evento `whatsapp_clicked` e abre diretamente o grupo oficial.
9. Nenhum dado pessoal é colocado na URL e não existe uma página intermediária de confirmação.

Falhas de rede ou backend mantêm o usuário no formulário, reabilitam o botão e exibem mensagem amigável. Duplo clique é bloqueado no cliente e a deduplicação também ocorre no banco.
