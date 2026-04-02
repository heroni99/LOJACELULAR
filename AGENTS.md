# AGENTS

Este repositorio usa um fluxo incremental guiado por documentacao curta e persistente.
Todo agente deve ler este arquivo antes de iniciar uma fase.

## Objetivo do produto

Construir um sistema web de loja de celular para operacao diaria em rede local.
O sistema deve evoluir, por fases, para cobrir:

- autenticacao e usuarios
- clientes e fornecedores
- categorias e produtos
- geracao de codigo interno
- suporte a codigo de barras
- estoque
- PDV presencial
- caixa
- historico de vendas
- dashboard
- relatorios
- auditoria
- base preparada para fiscal no futuro

## Fontes de verdade

Antes de implementar qualquer fase, revisar:

- `README.md`
- `docs/current-state.md`
- `docs/architecture.md`
- `docs/domain-rules.md`
- `docs/api-contract.md`
- `docs/codex-tasks/`

## Stack oficial

- Frontend: React 19.2 + Vite 8 + TypeScript
- Backend: NestJS 11 + TypeScript
- Banco: PostgreSQL 18
- ORM: Prisma 7.x
- Monorepo: pnpm workspaces
- UI: Tailwind + shadcn/ui
- Formularios: React Hook Form + Zod
- Data fetching: TanStack Query

## Arquitetura alvo

- monolito modular
- `apps/web`
- `apps/api`
- `packages/shared`
- `prisma/`
- `docs/`

## Principios tecnicos

- nao introduzir microservices
- nao trocar a stack sem necessidade real
- backend e a fonte de verdade das regras de negocio
- frontend deve priorizar fluxo rapido de operacao
- dinheiro sempre em centavos
- operacoes criticas sempre em transacao
- carrinho do PDV pode viver no frontend no MVP
- fiscal-core interno pode existir, mas emissao fiscal externa nao deve ser fingida

## Modo de trabalho

- trabalhar por fases pequenas
- antes de cada fase, listar os arquivos afetados
- depois de cada fase, resumir entregas e pendencias
- nunca deixar o projeto quebrado
- atualizar `README.md` quando setup, fluxo ou documentacao mudarem
- atualizar `prisma/seed.ts` quando schema, credenciais iniciais ou seed funcional mudarem
- atualizar migrations quando houver mudanca de banco
- validar build, typecheck e testes minimos sempre que a fase alterar codigo executavel

## Regras de negocio que nao podem ser esquecidas

- todo produto deve ter `internal_code`
- `internal_code` usa `PREFIXO-SEQUENCIAL` com 6 digitos
- o prefixo vem de `categories.prefix`
- a sequencia deve ser gerada com PostgreSQL `SEQUENCE` por categoria
- nunca usar `MAX + 1` para gerar codigo interno
- o sistema suporta multiplos codigos por produto
- nenhum codigo pode duplicar no sistema
- produtos serializados exigem IMEI ou serial
- `stock_movements.quantity` sempre positiva; o sentido vem de `movement_type`
- `store_id` deve existir desde o inicio
- venda so ocorre com sessao de caixa aberta
- checkout cria venda finalizada em transacao unica
- toda venda atualiza estoque, caixa e auditoria
- base fiscal deve ficar preparada desde cedo; comprovante interno e permitido, mas emissao fiscal externa nao

## Convencoes de implementacao

### Backend

- controllers finos
- services com regra de negocio
- DTOs com validacao
- autorizacao e auditoria no backend
- transacoes explicitas em fluxos criticos

### Frontend

- rotas alinhadas ao dominio
- formularios com React Hook Form + Zod
- estado de servidor com TanStack Query
- feedback de erro amigavel e objetivo
- UI de operacao deve priorizar velocidade e clareza

### Dados

- valores monetarios em centavos
- historico sensivel em tabelas de auditoria e movimentos
- UUIDs como identificadores
- datas em UTC
- seeds e migracoes devem permanecer funcionais

## Ordem das fases

Esta lista representa a trilha historica de crescimento do projeto.
O estado real atual da base deve ser lido em `docs/current-state.md`.

1. Fase 0 - Fundacao
2. Fase 1 - Auth + users + roles
3. Fase 2 - Customers + suppliers + categories
4. Fase 3 - Products + product codes
5. Fase 4 - Inventory
6. Fase 5 - Cash
7. Fase 6 - Sales / PDV
8. Fase 7 - Historico + dashboard
9. Fase 8 - Reports + audit
10. Fase 9 - Fiscal core

## Definicao de entrega por fase

Cada incremento deve, quando aplicavel, entregar:

- migration Prisma
- DTOs
- service
- controller
- tela frontend
- integracao frontend/backend
- testes minimos do modulo

## Estado atual da base

- a base atual ja ultrapassou a Fase 0
- auth esta ativa com login, refresh, logout e `auth/me`
- existem modulos funcionais de `stores/settings`, `customers`, `suppliers`, `categories`, `products`, `product_codes`, `product_units`, `inventory`, `pdv`, `sales`, `fiscal-core` interno, `service-orders`, `purchase-orders`, `sale-returns`, `accounts-payable` e `accounts-receivable`
- o shell principal atual expoe `dashboard`, `inventory`, `stock-locations`, `cash`, `pdv`, `sales`, `sale-returns`, `service-orders`, `purchase-orders`, `financial`, `accounts-payable`, `accounts-receivable`, `reports`, `fiscal`, `products`, `services`, `customers`, `suppliers`, `categories` e `stores/settings`
- `cash`, `financial`, `dashboard`, `reports` e auditoria complementar seguem em consolidacao final
- backlog fiscal avancado e anexos/orcamentos de OS continuam principalmente no nivel de schema nesta etapa
- as proximas fases devem seguir `docs/current-state.md` como status atual e `docs/codex-tasks/` como trilha historica
