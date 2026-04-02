# Task: Fase 7 - Historico + dashboard

## Objetivo

Adicionar visao gerencial inicial com historico de vendas e indicadores de operacao.

## Entidades foco

- `sales`
- `sale_items`
- `stock_balances`
- `cash_sessions`

## Backend

- listagem de vendas
- detalhe da venda
- resumo de dashboard
- top produtos
- baixo estoque
- grafico de vendas por periodo

## Frontend

- tela `/sales`
- filtros por periodo, usuario, cliente e status
- detalhe de venda
- tela `/dashboard`
- cards KPI
- graficos e listas resumidas

## Criterios de aceite

- historico permite localizar vendas por filtros basicos
- dashboard mostra KPIs coerentes com os dados
- consultas sao cacheadas com TanStack Query
- build e typecheck passam
