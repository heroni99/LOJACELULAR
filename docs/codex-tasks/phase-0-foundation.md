# Task: Fase 0 - Fundacao

## Status atual

A base atual ja cobre esta fase. Use este arquivo como referencia para manutencao
ou para recriar a fundacao em um novo repositorio.

## Objetivo

Entregar a base operacional do projeto sem deixar o monorepo quebrado.

## Escopo

- monorepo `pnpm`
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

## Backend

- NestJS com `GET /api/health`
- auth inicial com JWT
- seed minimo funcional

## Frontend

- tela inicial de login
- leitura do healthcheck
- integracao com auth base

## Criterios de aceite

- `pnpm install` funciona
- `pnpm docker:up` funciona
- `pnpm prisma:generate` funciona
- `pnpm prisma:seed` funciona
- `pnpm dev` ou `pnpm dev:wsl` sobe web e API
- login inicial funciona
