# Task: Fase 2 - Customers + suppliers + categories

## Objetivo

Criar os cadastros basicos administrativos necessarios para a evolucao do catalogo.

## Entidades foco

- `customers`
- `suppliers`
- `categories`

## Regras

- `categories.prefix` deve ser unico
- `categories.sequence_name` deve ser unico
- `categories.default_serialized` default false
- registros podem ser inativados sem perder historico

## Backend

- CRUD de clientes
- CRUD de fornecedores
- CRUD de categorias
- validacoes de unicidade
- auditoria de alteracoes sensiveis

## Frontend

- tela `/customers`
- tela `/suppliers`
- tela `/categories`
- listagem com filtros
- formularios de criar e editar
- confirmacao de inativacao

## Seed esperado

- categorias iniciais: CEL, CAP, PEL, CAB, CAR, FON, PEC e SER

## Criterios de aceite

- CRUD funcional para as tres entidades
- validacao amigavel no frontend
- backend impede prefixo duplicado
- build e typecheck passam
