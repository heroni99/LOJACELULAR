# Task: Fase 4 - Inventory

## Objetivo

Implementar saldo, movimentacoes, entradas, ajustes e controle de unidades serializadas.

## Entidades foco

- `stock_locations`
- `stock_balances`
- `stock_movements`
- `product_units`

## Regras

- `stock_balances` e saldo consolidado
- `stock_movements` e historico
- `quantity` sempre positiva
- ajuste exige motivo
- produtos serializados exigem IMEI ou serial quando aplicavel

## Backend

- CRUD basico de locais de estoque
- listagem de saldos
- listagem de movimentacoes
- entradas de estoque
- ajustes de estoque
- cadastro e controle de unidades serializadas

## Frontend

- tela `/inventory`
- filtros por local, produto e periodo
- fluxo de entrada
- fluxo de ajuste
- consulta de unidade por IMEI/serial

## Seed esperado

- local inicial `Estoque Principal`

## Criterios de aceite

- entrada gera saldo e movimento
- ajuste gera auditoria e movimento
- unidade serializada unica por IMEI/serial
- build e typecheck passam
