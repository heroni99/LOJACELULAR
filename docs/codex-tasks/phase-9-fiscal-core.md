# Task: Fase 9 - Fiscal core

## Objetivo

Preparar a base fiscal futura sem emissao real nesta etapa.

## Entidades foco

- `fiscal_documents`
- `fiscal_events`
- `fiscal_xml_storage`
- integracao com `sales`

## Regras

- nao emitir NFC-e ou NF-e real nesta fase
- manter status fiscal associado a venda
- armazenar eventos e XML de forma preparada para evolucao futura

## Backend

- models Prisma para base fiscal
- endpoints de consulta de documentos fiscais
- status fiscal atrelado a venda
- servicos preparados para futuras integracoes

## Frontend

- indicadores basicos de status fiscal nas vendas
- tela simples de consulta de documentos fiscais

## Criterios de aceite

- schema fiscal existe sem quebrar vendas
- API expone consulta de documentos e status
- build e typecheck passam
