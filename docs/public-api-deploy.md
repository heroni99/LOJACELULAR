# Public API Deploy

Este runbook publica a API Nest fora do Vercel e conecta o frontend hospedado no Vercel ao backend publico.

## Topologia alvo

- frontend em Vercel
- API NestJS em host Node persistente
- PostgreSQL acessivel para a API
- HTTPS em ambos os lados

## Variaveis obrigatorias

### Frontend no Vercel

- `VITE_API_URL=https://api.seudominio.com/api`

### API publica

- `NODE_ENV=production`
- `API_HOST=0.0.0.0`
- `API_PORT=3000`
- `API_CORS_ORIGIN=https://seu-projeto.vercel.app`
- `DATABASE_URL=postgresql://...`
- `JWT_SECRET=...`
- `JWT_ACCESS_SECRET=...`
- `JWT_REFRESH_SECRET=...`

Opcionalmente, ajuste tambem:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_STORE_*`

## Bootstrap da API publica

No host da API:

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm prisma:seed
pnpm build:api
pnpm start:api
```

Notas:

- `pnpm prisma:migrate:deploy` aplica apenas migrations existentes, sem fluxo interativo
- `pnpm prisma:seed` cria o usuario seed e a base inicial da loja
- `pnpm start:api` agora sobe a API em modo standalone via `node dist/main.js`

## Proxy e persistencia

- exponha a API em HTTPS, por exemplo `https://api.seudominio.com`
- encaminhe `/api` e `/uploads` para o processo Node
- habilite upgrade de WebSocket para o namespace do scanner/PDV
- mantenha a pasta `uploads/` persistente no host

## Validacao

Depois do deploy da API:

1. abra `https://api.seudominio.com/api/health`
2. confirme `https://api.seudominio.com/api/stores/current`
3. configure `VITE_API_URL` no Vercel
4. redeploy a web
5. abra o site publicado e confirme que o card de ambiente nao mostra mais `API: nao configurada`
6. teste login com o usuario seed do banco publico

## Credenciais seed

Por padrao, o seed usa:

- e-mail: `admin@local.test`
- senha: `Admin@123`

Se voce alterar `SEED_ADMIN_EMAIL` ou `SEED_ADMIN_PASSWORD` no ambiente publico, rode o seed novamente antes de testar o login.
