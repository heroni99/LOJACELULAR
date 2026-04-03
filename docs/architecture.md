# Architecture

## Objetivo

O LojaCelular e um monolito modular para operacao de uma loja de celular, acessado por navegador na rede interna ou em servidor local da operacao.

## Topologia atual

- `apps/web`: SPA React autenticada
- `apps/api`: API REST NestJS com regras de negocio
- `WebSocket / Socket.IO`: canal realtime do mesmo backend para scanner mobile e atualizacao imediata do PDV
- `PostgreSQL`: persistencia principal
- `packages/shared`: contratos, tipos e permissoes compartilhadas
- `prisma/`: schema, migrations e seed

## Responsabilidades

### Frontend

- login e restauracao de sessao
- shell principal autenticado
- telas operacionais e administrativas
- formularios, feedback visual e invalidacao de cache
- carrinho local do PDV no fluxo atual
- rota publica mobile de scanner para pareamento com o PDV

### Backend

- autenticacao JWT obrigatoria para rotas protegidas
- autorizacao por permissao e auditoria
- validacao de regras de negocio
- fluxos transacionais
- gateway realtime para pareamento entre desktop e celular no PDV
- acesso ao banco via Prisma

### Banco

- persistencia de dominio
- integridade referencial
- `SEQUENCE` por categoria para `internal_code`
- historico de auditoria, estoque, caixa, vendas e fiscal-core interno
- base para backlog fiscal e modulos avancados

## Shell principal atual

O shell autenticado hoje expoe:

- `dashboard`
- `inventory`
- `inventory/entry`
- `inventory/adjustment`
- `inventory/transfer`
- `inventory/units`
- `stock-locations`
- `cash`
- `pdv`
- `sales`
- `sale-returns`
- `service-orders`
- `purchase-orders`
- `financial`
- `commissions`
- `accounts-payable`
- `accounts-receivable`
- `reports`
- `fiscal`
- `products`
- `services`
- `customers`
- `suppliers`
- `categories`
- `settings/store`

Nem todo modulo no shell ja foi classificado como etapa fechada; alguns seguem em consolidacao, mas ja possuem rotas reais e integradas.

## Camadas de modulo

O repositorio hoje contem modulos em quatro estados:

### 1. Implementado e funcional

- auth
- users, roles e permissions
- stores/settings e branding
- customers, suppliers e categories
- products, services, product_codes e upload de imagem
- barcode operacional de produto fisico e etiqueta pequena de loja
- inventory, stock_locations e product_units
- PDV e sales com checkout transacional
- fiscal-core interno
- service-orders core
- service-order quotes e attachments
- purchase-orders core
- sale-returns
- commissions
- accounts-payable e accounts-receivable com fluxo operacional real

### 2. Implementado parcialmente

- cash
- accounts-payable
- accounts-receivable
- financial summary
- dashboard
- reports
- auditoria complementar da operacao comercial/gerencial

### 3. Implementado no banco mas nao executavel

- `fiscal_config`
- `fiscal_jobs`
- `fiscal_xml_storage`

### 4. Nao implementado

- `fiscal-emission` externo
- `printing`

## Fluxos criticos

### Login

1. frontend envia credenciais para `POST /api/auth/login`
2. backend valida usuario ativo, senha, role e permissoes
3. backend devolve access token, refresh token e usuario atual
4. frontend restaura sessao com `GET /api/auth/me` e `POST /api/auth/refresh`

### Catalogo

1. frontend cria ou edita item em `products`
2. backend valida categoria, fornecedor e regras de preco
3. backend persiste `internal_code`, relacoes, codigos alternativos, barcode da loja e resumo de unidades
4. frontend invalida consultas e recarrega listagem/detalhe pela API

### Inventory

1. frontend envia entrada, ajuste, transferencia ou gestao de unidade serializada
2. backend valida item fisico, local, quantidade e identificadores
3. backend atualiza `stock_balances`, `stock_movements` e `product_units`
4. frontend recarrega saldo, unidades e historico pela API

### Checkout

1. frontend monta carrinho local do PDV
2. backend recebe checkout consolidado
3. backend valida caixa aberto, estoque por local, barcode pesquisado no PDV e unidade serializada quando existir
4. backend cria venda, itens, pagamentos, movimentos, atualizacoes de unidade e auditoria em transacao unica
5. frontend invalida consultas e mostra o detalhe final da venda

### Scanner mobile do PDV

1. frontend do desktop cria uma `scanner_session` vinculada ao caixa aberto
2. backend devolve QR/code de pareamento e tokens temporarios da sessao
3. celular abre a rota publica `/scanner`, pareia com a sessao e conecta no gateway Socket.IO
4. leitura do barcode no celular e enviada ao backend, resolvida pelo `PdvService` com base em `product_codes`, `internal_code`, `supplier_code` e IMEI
5. o gateway publica o produto no desktop e o PDV adiciona o item ao carrinho sem duplicar as regras do checkout

### Etiquetas de produto

1. produto fisico recebe barcode da loja baseado no `internal_code`
2. frontend consulta preview real da etiqueta pela API
3. a etiqueta e renderizada em `CODE 128`, com nome curto e codigo legivel
4. o operador imprime pela web e usa o mesmo codigo no PDV com leitor comum

### Fiscal core interno

1. venda concluida pode gerar comprovante interno
2. backend cria `fiscal_documents` e `fiscal_events`
3. `sales.fiscalStatus` e `sales.fiscalDocumentId` sao atualizados
4. cancelamento interno gera evento rastreavel sem fingir emissao SEFAZ

### Service orders core

1. frontend cria a OS com cliente, aparelho e defeito relatado
2. backend gera `orderNumber`, persiste a ordem e grava o primeiro status
3. mudancas de status alimentam `service_order_status_history`
4. itens do tipo `PART` podem consumir estoque real em transacao

### Purchase orders core

1. frontend cria o pedido com fornecedor e itens
2. backend gera `orderNumber`, persiste o rascunho e controla status
3. recebimento parcial ou total atualiza itens, saldos e `product_units`
4. o recebimento pode alimentar `accounts-payable` por vinculacao assistida

### Sale returns

1. frontend abre a devolucao a partir de uma venda concluida
2. backend valida quantidades ja devolvidas e o tipo de reembolso
3. item fisico retorna ao estoque; item serializado volta para `IN_STOCK`
4. reembolso monetario usa caixa aberto quando aplicavel e grava historico real

## Principios de crescimento

- backend e a fonte de verdade das regras de negocio
- modulo no schema nao conta como modulo pronto
- modulo no shell nao deve ser anunciado como fechado sem auditoria funcional
- seed, migrations e docs devem evoluir junto com os fluxos
- `product_units` pertence operacionalmente ao inventario, nao ao catalogo
- fiscal-core interno pode evoluir sem fingir emissao fiscal externa pronta
- commissions seguem permission-driven no shell e no backend, sem regra automatica de calculo nesta fase

Para o detalhamento por modulo e classificacao oficial, use `docs/current-state.md`.
