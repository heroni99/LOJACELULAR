# Task: Fase 6 - Sales / PDV

## Objetivo

Entregar o PDV presencial com scanner, busca manual, carrinho local e checkout transacional.

## Entidades foco

- `sales`
- `sale_items`
- `sale_payments`
- `sale_refunds`
- `stock_movements`
- `cash_movements`
- `product_units`

## Regras

- carrinho fica no frontend no MVP
- backend recebe apenas checkout
- venda nasce finalizada
- venda so com caixa aberto
- checkout roda em transacao unica
- venda atualiza estoque, caixa e auditoria

## Backend

- endpoint `POST /sales/checkout`
- validacao de estoque
- validacao de unidade serializada
- persistencia de venda, itens e pagamentos
- movimentos de estoque e caixa
- auditoria do checkout

## Frontend

- tela `/pdv`
- campo de leitura sempre acessivel
- busca manual por nome, codigo e IMEI
- carrinho
- desconto
- pagamento
- total, troco e finalizacao

## Criterios de aceite

- checkout falha sem caixa aberto
- checkout falha com estoque insuficiente
- venda serializada exige unidade
- venda concluida atualiza estoque, caixa e auditoria
- build e typecheck passam
