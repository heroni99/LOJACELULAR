# ALPHA TECNOLOGIA

Sistema web para operacao de loja de celular em rede local, organizado como monorepo `pnpm` com frontend React/Vite, backend NestJS, PostgreSQL e Prisma.

## Estado atual consolidado

Esta base ja ultrapassou a fundacao inicial. Hoje a documentacao separa o repositorio em quatro referencias praticas:

- `shell principal`: rotas expostas no menu principal autenticado
- `implementado e funcional`: fluxo real validado no backend, no banco e na interface
- `implementado parcialmente`: fluxo presente no codigo, mas ainda em consolidacao
- `schema preparado`: tabelas e relacionamentos existentes no Prisma sem modulo executavel correspondente

A fonte de verdade do estado atual fica em [docs/current-state.md](docs/current-state.md).

## Shell principal atual

O shell autenticado hoje expoe:

- `dashboard`
- `inventory`
- `inventory/units`
- `stock-locations`
- `cash`
- `pdv`
- `sales`
- `sale-returns`
- `service-orders`
- `purchase-orders`
- `financial`
- `accounts-payable`
- `accounts-receivable`
- `reports`
- `fiscal`
- `products`
- `services`
- `customers`
- `suppliers`
- `categories`
- `settings/store`

## Modulos implementados e funcionais

- auth obrigatoria com `login`, `refresh`, `logout` e `GET /auth/me`
- branding da loja a partir de `stores`, aplicado ao login e ao shell
- `stores/settings` com leitura publica da store ativa e atualizacao protegida
- `users`, `roles` e permissoes com controle de acesso no backend
- auditoria basica de auth, loja, cadastros, usuarios e permissoes
- CRUD real de `customers`, `suppliers` e `categories`
- catalogo real de `products` e `services` com separacao por `is_service`
- `internal_code` gerado com `SEQUENCE` PostgreSQL por categoria
- `product_codes` com CRUD real no escopo do produto
- barcode operacional por produto fisico, com geracao automatica de codigo da loja baseado no `internal_code`
- `product_units` com gestao operacional em `inventory/units`, local atual por unidade e seed serializado
- upload local de imagem de produto
- etiqueta pequena de produto com `CODE 128` imprimivel pela web para uso em loja fisica
- `inventory` com saldos, movimentacoes, entradas, ajustes, transferencias e busca por IMEI/serial
- `stock_locations` com cadastro e local padrao
- `sales` com checkout transacional real, exigencia de caixa aberto, baixa de estoque por local e atualizacao de `product_units`
- `pdv` com busca real por nome, barcode, `internal_code`, `supplier_code` e IMEI, local de estoque operacional, scanner mobile em tempo real por WebSocket e venda de item serializado por unidade
- `fiscal-core` minimo com comprovante interno, cancelamento rastreado, historico de eventos e relatorio fiscal basico
- `service-orders` com abertura, edicao, historico real de status, itens operacionais e consumo de pecas com impacto em estoque
- `purchase-orders` com criacao, alteracao de status, recebimento parcial/total e entrada real em estoque
- `sale-returns` com devolucao vinculada a venda, retorno real ao estoque e reembolso operacional coerente
- `accounts-payable` com vinculacao opcional a `purchase-orders`, persistencia real e baixa operacional
- `accounts-receivable` com vinculacao opcional a `service-orders` e `sales`, persistencia real e recebimento operacional

## Modulos implementados parcialmente

Estes modulos ja possuem codigo real no backend e/ou frontend, mas ainda nao devem ser tratados como etapa fechada do produto:

- `cash`
- `financial/summary`
- `dashboard`
- `reports`
- auditoria complementar da operacao comercial e de relatorios

Eles existem no repositorio e ja estao no shell principal, mas ainda estao em fase de consolidacao final do bloco operacional/gerencial.

## Preparado apenas no schema

Estas areas ja tem base de dados preparada, mas ainda nao possuem modulo executavel correspondente:

- componentes fiscais ainda nao operacionalizados (`fiscal_config`, `fiscal_jobs`, `fiscal_xml_storage`)
- `service_order_attachments`
- `service_order_quotes`
- `sales_commissions`
- `sales_targets`

## Nao implementado como modulo executavel

- `fiscal-emission`
- `fiscal-queue` operacional
- `fiscal-config` operacional
- integracao fiscal avancada com `sales` alem do comprovante interno/documental
- `printing` geral fora do fluxo de etiquetas de produto

## Estrutura

```text
apps/
  api/       Backend NestJS 11
  web/       Frontend React 19.2 + Vite 8
packages/
  shared/    Schemas e tipos compartilhados
prisma/      Schema, migrations e seed
docs/        Documentacao de arquitetura, contrato e estado atual
```

## Documentacao

- `AGENTS.md`: instrucoes persistentes para agentes e ordem das fases historicas
- `docs/current-state.md`: matriz real de status por modulo
- `docs/architecture.md`: arquitetura atual, shell principal e fronteiras entre camadas
- `docs/domain-rules.md`: regras de negocio obrigatorias
- `docs/api-contract.md`: contrato do que esta implementado hoje vs. o que ainda esta parcial ou planejado
- `docs/phase-0.md`: registro historico da fase inicial
- `docs/codex-tasks/`: tarefas historicas por fase; nao substituem o estado atual consolidado

## Requisitos locais

- Node.js 22+
- pnpm 10+
- Docker Desktop com Docker Compose

## Observacoes de ambiente

- A API e o seed leem variaveis do arquivo `.env`; copie `.env.example` antes de rodar os comandos.
- Se voce ja vinha de uma base anterior, revise o `.env` local para alinhar `SEED_STORE_*`, `SEED_ADMIN_*` e os `JWT_*` com o `.env.example` atualizado.
- O projeto usa Prisma 7 com `prisma.config.ts` e adapter PostgreSQL, carregando o `.env` da raiz do monorepo.
- O arquivo `.env.example` prepara branding da loja, credenciais seed e os segredos JWT usados no fluxo real de login.
- A web consome os contratos compartilhados via `apps/web/src/shared/index.ts`, reexportando `packages/shared/src/index.ts`, para evitar problemas de export CommonJS no navegador durante `pnpm dev`.
- `API_CORS_ORIGIN` aceita lista separada por virgulas; em desenvolvimento, a API tambem aceita `localhost`, `127.0.0.1` e IPs privados comuns da rede local.
- O `docker-compose` usa PostgreSQL 18 com volume em `/var/lib/postgresql`, que e o layout compativel com as imagens 18+.
- Em WSL, prefira manter o projeto no filesystem Linux da distro em vez de `/mnt/c/...`, porque processos longos do Node podem degradar bastante nesse tipo de montagem.
- Em instalacoes com `pnpm` que bloqueiam scripts de build, rode `pnpm install` novamente apos atualizar dependencias ou use `pnpm rebuild`.
- O scanner mobile no navegador exige contexto seguro de camera; em celular, prefira acessar a web por `https://...` ou `localhost` quando estiver testando a camera.

## Setup rapido

1. Copie `.env.example` para `.env`.
2. Suba o PostgreSQL:

```bash
pnpm docker:up
```

3. Instale as dependencias:

```bash
pnpm install
```

4. Gere o Prisma Client:

```bash
pnpm prisma:generate
```

5. Aplique as migrations:

```bash
pnpm --filter @lojacelular/api prisma:migrate:dev --name init
```

6. Rode o seed:

```bash
pnpm prisma:seed
```

7. Suba web, api e pacote shared:

```bash
pnpm dev
```

### Login inicial

Depois do seed, entre na web com um usuario real do banco. O fluxo de login, refresh e logout faz parte da operacao normal do sistema.

### WSL recomendado

Se o projeto estiver em `/mnt/c/...` e a web abrir com tela branca ou processos do Node ficarem instaveis, use:

```bash
pnpm dev:wsl
```

Esse comando sincroniza o repositorio para `~/LOJACELULAR-wsl`, sobe o PostgreSQL e roda a aplicacao a partir do filesystem Linux da distro.

## Endpoints base

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api`
- Healthcheck: `http://localhost:3000/api/health`

Para a lista de endpoints por modulo e o status de cada grupo, use [docs/api-contract.md](docs/api-contract.md).

## Credenciais seed iniciais

O seed parte destes valores no `.env.example`:

- e-mail: `admin@local.test`
- senha: `Admin@123`

No ambiente real, o login sempre usa o usuario criado pelo ultimo `pnpm prisma:seed` executado com o seu `.env` atual. Se voce alterar `SEED_ADMIN_EMAIL` ou `SEED_ADMIN_PASSWORD`, rode o seed novamente para recriar ou atualizar o admin inicial.

Esses valores podem ser alterados no `.env` via:

- `SEED_ADMIN_NAME`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_STORE_CODE`
- `SEED_STORE_NAME`
- `SEED_STORE_DISPLAY_NAME`
- `SEED_CASH_TERMINAL_NAME`
- `SEED_STORE_PRIMARY_COLOR`
- `SEED_STORE_SECONDARY_COLOR`
- `SEED_STORE_ACCENT_COLOR`
- `SEED_STORE_LOGO_URL`
- `SEED_STORE_BANNER_URL`
- `SEED_STORE_HERO_BANNER_ENABLED`

## Deploy da web no Vercel

O repositorio agora inclui `vercel.json` na raiz para publicar apenas a SPA de `apps/web`.

Use este arranjo:

- frontend no Vercel
- API NestJS em outro host Node com processo persistente
- PostgreSQL fora do Vercel

Importante:

- a web precisa de `VITE_API_URL` apontando para a URL publica da API, por exemplo `https://api.seudominio.com/api`
- sem uma API publica configurada, o login e os fluxos protegidos nao funcionam no deploy
- o backend atual usa Prisma, PostgreSQL e Socket.IO para o scanner/PDV; esse bloco nao deve ser tratado como deploy pronto para Vercel do jeito atual

Se for criar o projeto no painel do Vercel, importe o repositorio normalmente pela raiz. O `vercel.json` ja define:

- instalacao com `pnpm`
- build apenas de `@lojacelular/shared` e `@lojacelular/web`
- saida em `apps/web/dist`
- fallback de rotas para `index.html` no SPA

O seed tambem cria os owners:

- `nicolas@alphatecnologia.local`
- `pedro@alphatecnologia.local`

Ambos nascem com a mesma senha inicial definida em `SEED_ADMIN_PASSWORD`.

## Prioridades reais a partir desta base

1. Validar e consolidar os modulos ainda parciais do shell: `cash`, `financial`, `dashboard`, `reports`
2. Fechar a auditoria complementar da operacao comercial e dos relatorios
3. Evoluir do `fiscal-core` interno para backlog fiscal avancado sem fingir emissao externa pronta
4. Tratar `service_order_attachments`, `service_order_quotes`, `commissions` e `printing` como backlog real, sem promover schema preparado para modulo pronto

## Observacoes finais

- O pacote `@lojacelular/shared` compila para `dist` e participa do fluxo de `pnpm dev`.
- Sempre que a estrutura do banco mudar, atualize tambem o `prisma/seed.ts`.
- O roadmap historico do projeto continua documentado em `AGENTS.md` e `docs/codex-tasks/`, mas o estado atual consolidado do produto fica em `docs/current-state.md`.
