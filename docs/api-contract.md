# API Contract

## Convencoes gerais

- prefixo global: `/api`
- formato: JSON
- autenticacao: obrigatoria em todas as rotas protegidas
- dinheiro: centavos
- datas: ISO 8601 em UTC
- erros de validacao retornam mensagem objetiva e detalhes quando houver

Este arquivo descreve o contrato pelo estado real atual:

- `implementado e funcional`
- `implementado parcialmente`
- `implementado no banco mas nao executavel`
- `nao implementado`

Para a classificacao completa por modulo, use `docs/current-state.md`.

## Implementado e funcional

### Health

- `GET /api/health`

### Auth

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Users

- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `PATCH /api/users/:id/password`
- `PATCH /api/users/:id/active`

### Roles

- `GET /api/roles`
- `GET /api/roles/:id`
- `PATCH /api/roles/:id/permissions`

### Stores

- `GET /api/stores`
- `GET /api/stores/current`
- `GET /api/stores/:id`
- `PATCH /api/stores/:id/settings`

### Customers

- `GET /api/customers`
- `POST /api/customers`
- `GET /api/customers/:id`
- `PATCH /api/customers/:id`
- `DELETE /api/customers/:id`

Query suportada:

- `search`
- `active`
- `take` (`1..200`)

### Suppliers

- `GET /api/suppliers`
- `POST /api/suppliers`
- `GET /api/suppliers/:id`
- `PATCH /api/suppliers/:id`
- `DELETE /api/suppliers/:id`

Query suportada:

- `search`
- `active`
- `take` (`1..200`)

### Categories

- `GET /api/categories`
- `POST /api/categories`
- `GET /api/categories/:id`
- `PATCH /api/categories/:id`
- `DELETE /api/categories/:id`

Query suportada:

- `search`
- `active`
- `take` (`1..200`)

### Products e services

- `GET /api/products`
- `POST /api/products`
- `GET /api/products/:id`
- `PATCH /api/products/:id`
- `PATCH /api/products/:id/active`
- `GET /api/products/search`
- `GET /api/products/by-code/:internalCode`
- `GET /api/products/by-supplier-code/:supplierCode`
- `GET /api/products/by-barcode/:code`
- `GET /api/products/by-imei/:imei`
- `POST /api/products/:id/image`

Query suportada:

- `search`
- `categoryId`
- `supplierId`
- `brand`
- `active`
- `isService`
- `take` (`1..200`)

Resposta de leitura inclui:

- `codes[]`
- `unitSummary.totalUnits`
- `unitSummary.inStockUnits`
- `unitSummary.soldUnits`
- `unitSummary.reservedUnits`
- `unitSummary.damagedUnits`

### Product codes

- `POST /api/products/:id/codes`
- `PATCH /api/products/:id/codes/:codeId`
- `DELETE /api/products/:id/codes/:codeId`
- `GET /api/products/:id/barcode`
- `POST /api/products/:id/barcode/generate`
- `POST /api/products/labels`

Payload:

- `code`
- `codeType`
- `isPrimary?`

Observacoes:

- produto fisico recebe barcode operacional da loja com base no `internal_code`
- a etiqueta de produto usa `CODE 128` como padrao principal para loja fisica
- `POST /api/products/labels` devolve preview imprimivel de etiqueta pequena

### Inventory e stock locations

- `GET /api/stock-locations`
- `POST /api/stock-locations`
- `PATCH /api/stock-locations/:id`
- `GET /api/inventory/balances`
- `GET /api/inventory/movements`
- `POST /api/inventory/entries`
- `POST /api/inventory/adjustments`
- `POST /api/inventory/transfers`
- `GET /api/inventory/units`
- `POST /api/inventory/units`
- `PATCH /api/inventory/units/:id`
- `POST /api/inventory/units/:id/transfer`

Observacoes:

- item nao serializado usa `stock_balances` agregado
- item serializado usa `product_units` com `currentLocationId`
- ajuste agregado de item serializado e bloqueado; a gestao correta ocorre em `inventory/units`

### PDV

- `GET /api/pdv/product-search`
- `GET /api/pdv/by-barcode/:code`
- `GET /api/pdv/by-code/:internalCode`
- `GET /api/pdv/by-supplier-code/:supplierCode`
- `GET /api/pdv/by-imei/:imei`

Query suportada:

- `query`
- `locationId`

### Scanner sessions

- `POST /api/scanner-sessions`
- `GET /api/scanner-sessions/:id/status`
- `POST /api/scanner-sessions/:id/disconnect`
- `POST /api/scanner-sessions/pair`

Observacoes:

- `POST /api/scanner-sessions` exige `sales.checkout` e cria uma sessao temporaria vinculada a um caixa aberto
- `POST /api/scanner-sessions/pair` e publico para o celular e aceita `pairingCode` ou `sessionId + pairingToken`
- a sessao usa o namespace Socket.IO `/scanner` para `desktop join`, `scanner join`, `scanner read` e atualizacao de status
- o backend resolve leituras reaproveitando `product_codes`, `internal_code`, `supplier_code` e IMEI do PDV

### Sales

- `POST /api/sales/checkout`
- `GET /api/sales`
- `GET /api/sales/:id`

Observacoes:

- checkout exige sessao de caixa aberta
- item fisico exige `stockLocationId` ou local derivavel de forma segura
- item serializado usa `productUnitId`, baixa estoque do local atual e marca a unidade como `SOLD`
- o PDV aceita lookup por barcode, `internal_code`, `supplier_code`, nome e IMEI

### Fiscal core interno

- `GET /api/fiscal/documents`
- `GET /api/fiscal/documents/:id`
- `POST /api/fiscal/documents/internal-receipt`
- `POST /api/fiscal/receipt/:saleId/print-link`
- `GET /api/fiscal/receipt/:saleId`
- `POST /api/fiscal/documents/:id/cancel`
- `GET /api/fiscal/report`

Observacoes:

- emite comprovante interno da loja
- gera HTML termico 80mm para impressao via navegador com URL temporaria assinada
- nao faz emissao fiscal SEFAZ
- usa `fiscal_documents` e `fiscal_events` reais

### Service orders

- `GET /api/service-orders`
- `POST /api/service-orders`
- `GET /api/service-orders/:id`
- `POST /api/service-orders/:id/receipt/print-link`
- `GET /api/service-orders/:id/receipt`
- `PATCH /api/service-orders/:id`
- `GET /api/service-orders/:id/quotes`
- `POST /api/service-orders/:id/quotes`
- `PATCH /api/service-orders/:id/quotes/:quoteId`
- `POST /api/service-orders/:id/quotes/:quoteId/approve`
- `POST /api/service-orders/:id/quotes/:quoteId/reject`
- `GET /api/service-orders/:id/attachments`
- `POST /api/service-orders/:id/attachments`
- `DELETE /api/service-orders/:id/attachments/:attachmentId`
- `POST /api/service-orders/:id/status`
- `POST /api/service-orders/:id/items/:itemId/consume`

Observacoes:

- create/update manipulam cabecalho e itens operacionais da OS
- o comprovante imprimivel de OS usa `format=a4|thermal` e abre por URL temporaria assinada
- create/update de quote recebem `items: [{ description, quantity, unit_price, item_type, product_id? }]` e `notes?`
- upload de anexos aceita `image/jpeg`, `image/png`, `image/webp` e `application/pdf` com limite de 10 MB
- historico de status e gravado em `service_order_status_history`
- so pode existir um orcamento ativo (`PENDING` ou `APPROVED`) por OS
- consumo de item `PART` afeta estoque real em transacao

### Purchase orders

- `GET /api/purchase-orders`
- `POST /api/purchase-orders`
- `GET /api/purchase-orders/:id`
- `PATCH /api/purchase-orders/:id`
- `POST /api/purchase-orders/:id/status`
- `POST /api/purchase-orders/:id/receive`

Observacoes:

- create/update manipulam cabecalho e itens do pedido
- recebimento parcial e total atualiza `stock_balances`, `stock_movements` e `product_units`
- o ultimo custo recebido atualiza o `costPrice` do produto

### Sale returns

- `GET /api/sale-returns`
- `POST /api/sale-returns`
- `GET /api/sale-returns/:id`

Observacoes:

- devolucao referencia uma venda existente
- item fisico pode retornar ao estoque quando aplicavel
- item serializado retorna ao estoque pela propria `product_unit`
- reembolso monetario usa caixa aberto quando exigido

### Accounts payable

- `GET /api/accounts-payable`
- `POST /api/accounts-payable`
- `PATCH /api/accounts-payable/:id`
- `POST /api/accounts-payable/:id/pay`

Observacoes:

- pode vincular a conta a um `purchaseOrderId`
- baixa operacional reflete no resumo financeiro real

### Accounts receivable

- `GET /api/accounts-receivable`
- `POST /api/accounts-receivable`
- `PATCH /api/accounts-receivable/:id`
- `POST /api/accounts-receivable/:id/receive`

Observacoes:

- pode vincular a conta a `saleId` e/ou `serviceOrderId`
- recebimento operacional reflete no resumo financeiro real

### Commissions

- `GET /api/commissions/my-summary`
- `GET /api/commissions/team-summary`
- `POST /api/commissions`
- `GET /api/commissions/targets`
- `POST /api/commissions/targets`

Observacoes:

- `my-summary` devolve total de comissoes do periodo, total vendido do usuario, meta e lista de registros vinculados a vendas
- `team-summary` devolve linhas por usuario ativo com venda concluida, comissao registrada ou meta no periodo
- `POST /api/commissions` registra comissao manual vinculada a um `saleId` e um `userId`
- `POST /api/commissions/targets` faz upsert por `userId + periodMonth + periodYear`
- o periodo das comissoes usa `month` e `year`; na ausencia, a API usa o mes corrente da loja

## Implementado parcialmente

Os grupos abaixo possuem backend e frontend reais, mas ainda seguem em consolidacao do bloco operacional/gerencial.

### Cash

- `GET /api/cash/terminals`
- `POST /api/cash/terminals`
- `PATCH /api/cash/terminals/:id`
- `PATCH /api/cash/terminals/:id/active`
- `GET /api/cash/current-session`
- `POST /api/cash/open`
- `POST /api/cash/deposit`
- `POST /api/cash/withdrawal`
- `POST /api/cash/close`
- `GET /api/cash/history`
- `GET /api/cash/sessions/:id`

### Financial

- `GET /api/financial/summary`

### Dashboard

- `GET /api/dashboard/summary`
- `GET /api/dashboard/top-products`
- `GET /api/dashboard/low-stock`
- `GET /api/dashboard/sales-chart`

### Reports

- `GET /api/reports/sales`
- `GET /api/reports/stock`
- `GET /api/reports/cash`
- `GET /api/reports/customers`
- `GET /api/reports/export/sales`
- `GET /api/reports/export/stock`
- `GET /api/reports/export/cash`
- `GET /api/reports/export/customers`

Observacoes:

- os reports atuais aceitam `format=csv`
- as rotas `/api/reports/export/*` retornam o CSV diretamente como arquivo
- os exports aceitam `start` e `end` como alias de `startDate` e `endDate`
- os graficos e KPIs atuais usam dados reais do banco
- o bloco gerencial ainda nao foi marcado como totalmente fechado

### Audit

- `GET /api/audit`

## Implementado no banco mas nao executavel

- `fiscal_config`
- `fiscal_jobs`
- `fiscal_xml_storage`

## Nao implementado

- `fiscal-emission` externo
- `printing`

## DTOs operacionais principais

### Login

- request:
  - `email: string`
  - `password: string`
- response:
  - `accessToken: string`
  - `expiresIn: string`
  - `refreshToken: string`
  - `refreshExpiresIn: string`
  - `user`

### Sales checkout

- `cashTerminalId: string`
- `customerId?: string`
- `discount: number`
- `notes?: string`
- `items[]`
  - `productId: string`
  - `quantity: number`
  - `unitPrice: number`
  - `discount?: number`
  - `productUnitId?: string`
  - `stockLocationId?: string`
- `payments[]`
  - `method: string`
  - `amount: number`
  - `notes?: string`

### Inventory units create

- `productId: string`
- `locationId: string`
- `units[]`
  - `imei?: string`
  - `imei2?: string`
  - `serialNumber?: string`
  - `purchaseCost?: number`
  - `notes?: string`

### Fiscal internal receipt

- `saleId: string`
- `notes?: string`
