# Task: Fase 3 - Products + product codes

## Objetivo

Entregar o cadastro de produtos com codigos internos e codigos alternativos.

## Entidades foco

- `products`
- `product_codes`
- `categories`

## Regras

- todo produto deve ter `internal_code`
- `internal_code` usa `PREFIXO-SEQUENCIAL`
- sequencia por categoria com PostgreSQL `SEQUENCE`
- nenhum codigo pode duplicar no sistema
- produto pode ter varios codigos

## Backend

- CRUD de produtos
- geracao transacional de `internal_code`
- CRUD de codigos alternativos
- busca por nome, codigo interno, barcode e IMEI

## Frontend

- tela `/products`
- filtros e busca
- criar e editar produto
- gerenciar codigos alternativos
- base para etiqueta simples

## Criterios de aceite

- produto nasce com `internal_code` valido
- backend nunca usa `MAX + 1`
- busca por codigo encontra produto corretamente
- build e typecheck passam
