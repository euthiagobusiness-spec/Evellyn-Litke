# Rollback - hardening de performance MRC (20/07/2026)

## Baseline estável

- Commit Git: `f725456`
- Deployment Vercel: `dpl_9aEVZ3rw6KS5fupMBfx5Zfx2ZCBb`
- URL imutável: `https://evellyn-litke-e5m1a621h-othiagomarketing-9539s-projects.vercel.app`
- Alias de produção: `https://www.eventomrc.com.br`
- Estado verificado antes da mudança: `Ready`

## Backup dos dados

O snapshot pré-mudança foi exportado com 77 leads, 348 registros de consentimento e 236 eventos. Os arquivos estão em `backups/2026-07-20-pre-performance/`, ignorados pelo Git, criptografados com OpenPGP/AES-256 e com ACL NTFS limitada ao usuário local.

A descriptografia e a leitura estrutural foram verificadas em 20/07: 77 leads, 348 consentimentos e 236 eventos foram recuperados sem expor o conteúdo no terminal.

## Retorno da Vercel em menos de cinco minutos

1. Confirmar que o deployment acima continua com estado `Ready`.
2. Executar `npx vercel@latest promote evellyn-litke-e5m1a621h-othiagomarketing-9539s-projects.vercel.app --yes`.
3. Abrir `https://www.eventomrc.com.br/` e testar carregamento, formulário e rotas legais.
4. Registrar horário, motivo e responsável no diário operacional.

Alternativa: usar `npx vercel@latest rollback dpl_9aEVZ3rw6KS5fupMBfx5Zfx2ZCBb --yes` se a promoção não estiver disponível.

## Retorno do código

Não usar `git reset --hard`. Criar um revert explícito do commit de implantação e enviar para `main`, preservando o histórico.

## Banco e Edge Functions

As migrações deste sprint devem ser aditivas. Em falha de frontend, o rollback da Vercel não exige desfazer o banco. Em falha de Edge Function, publicar novamente a versão anterior obtida no Supabase antes de considerar qualquer reversão de dados. Restauração de dados exige validação humana do snapshot e deve ser feita somente pelo administrador Supabase.

## Autorizações

- Autoriza rollback: responsável pelo lançamento MRC.
- Executa rollback técnico: Dev/Analytics.
- Valida o funil após retorno: Dev/Analytics + responsável pela comunidade.
