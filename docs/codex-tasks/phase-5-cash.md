# Task: Fase 5 - Cash

## Objetivo

Criar o modulo de caixa com terminal, sessao, suprimento, sangria e fechamento.

## Entidades foco

- `cash_terminals`
- `cash_sessions`
- `cash_movements`

## Regras

- um terminal so pode ter uma sessao aberta por vez
- um usuario nao deve abrir duas sessoes simultaneas no mesmo terminal
- fechamento calcula diferenca automaticamente
- venda depende de sessao aberta

## Backend

- abrir caixa
- consultar sessao atual
- suprimento
- sangria
- fechar caixa
- historico de sessoes e movimentos

## Frontend

- tela `/cash`
- abertura de caixa
- sessao atual
- suprimento
- sangria
- fechamento com resumo

## Seed esperado

- terminal inicial `Caixa 1`

## Criterios de aceite

- nao permite duas sessoes abertas no mesmo terminal
- fechamento calcula esperado x informado
- endpoints retornam resumo de sessao e movimentos
- build e typecheck passam
