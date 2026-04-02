# Fase 0 (historico)

Este arquivo registra apenas a fundacao inicial do projeto.

Ele nao descreve o estado atual do sistema. Para o status consolidado de hoje, use `docs/current-state.md`.

## Objetivo da fase

Entregar a base operacional do projeto sem deixar o monorepo quebrado:

- workspace `pnpm`
- `apps/web`
- `apps/api`
- `packages/shared`
- Prisma
- Docker Compose com PostgreSQL 18
- `.env.example`
- `README.md`
- `AGENTS.md`
- healthcheck
- auth base

## Arquivos afetados nesta fase

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.gitignore`
- `.editorconfig`
- `.env.example`
- `docker-compose.yml`
- `apps/web/**`
- `apps/api/**`
- `packages/shared/**`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `README.md`
- `AGENTS.md`

## Entregas historicas

- monorepo estruturado
- pacote compartilhado com schemas de auth e health
- backend NestJS com:
  - `GET /api/health`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
- frontend com login base e leitura do healthcheck
- seed inicial com loja, role admin, permissoes base e usuario administrador
- documentacao de bootstrap local

## Pendencias que existiam apos a Fase 0

- adicionar o restante das entidades obrigatorias do dominio
- configurar migracoes iniciais versionadas
- evoluir auth para RBAC completo
- criar CRUDs de usuarios, clientes, fornecedores, categorias e produtos
- iniciar dashboard, auditoria expandida e estrutura fiscal-base
