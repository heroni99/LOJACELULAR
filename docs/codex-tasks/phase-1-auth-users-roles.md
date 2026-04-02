# Task: Fase 1 - Auth + users + roles

## Contexto

Sistema web de loja de celular em monorepo com React/Vite no frontend,
NestJS no backend e PostgreSQL com Prisma.

## Objetivo

Evoluir a base de autenticacao para auth completa com usuarios, roles,
refresh tokens, protecao de rotas e auditoria minima.

## Entidades foco

- `stores`
- `roles`
- `role_permissions`
- `users`
- `refresh_tokens`
- `audit_logs`

## Regras

- usuario inativo nao loga
- senha com hash
- refresh token salvo com hash
- backend valida permissoes
- somente OWNER cria outro OWNER
- MANAGER nao promove para OWNER

## Backend

- login
- refresh
- logout
- auth/me
- CRUD de usuarios
- leitura e atualizacao de permissoes por role
- guards e decorators de permissao
- auditoria minima de login e alteracao de usuario

## Frontend

- tela `/login`
- rota protegida base
- tela `/users`
- criar, editar, ativar/inativar e trocar senha

## Seed esperado

- roles OWNER, MANAGER, CASHIER, SELLER e STOCK
- usuario admin inicial com troca obrigatoria de senha

## Criterios de aceite

- login, refresh e logout funcionam
- `/users` protegida por permissao
- backend rejeita usuario inativo
- seeds e migracoes continuam funcionais
- build e typecheck passam
