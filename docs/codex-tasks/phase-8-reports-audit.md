# Task: Fase 8 - Reports + audit

## Objetivo

Entregar relatorios filtraveis e tela de auditoria consultavel.

## Entidades foco

- `audit_logs`
- `sales`
- `stock_movements`
- `cash_movements`
- `customers`

## Backend

- relatorio de vendas
- relatorio de estoque
- relatorio de caixa
- relatorio de clientes
- exportacao CSV
- consulta paginada de auditoria

## Frontend

- tela `/reports`
- filtros por periodo e entidade
- exportacao CSV
- tela `/audit`
- filtros por acao, entidade, usuario e data

## Regras

- auditoria precisa ser pesquisavel
- exportacao respeita filtros aplicados
- respostas devem ser performaticas para operacao local

## Criterios de aceite

- CSV reflete os filtros informados
- auditoria lista eventos sensiveis com contexto suficiente
- build e typecheck passam
