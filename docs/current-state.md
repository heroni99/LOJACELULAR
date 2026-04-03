# Estado Atual Consolidado

Esta matriz separa o estado real do sistema em seis classificacoes:

- `IMPLEMENTADO E FUNCIONAL`
- `IMPLEMENTADO PARCIALMENTE`
- `NAO IMPLEMENTADO`
- `IMPLEMENTADO NO BANCO MAS NAO EXECUTAVEL`
- `IMPLEMENTADO NO BACKEND MAS SEM FRONTEND`
- `IMPLEMENTADO NO FRONTEND MAS SEM FLUXO REAL`

Quando houver conflito entre documentacao e codigo, a fonte de verdade e:

1. comportamento real do codigo
2. contratos e schema Prisma
3. shell principal autenticado
4. README
5. roadmap historico

## Shell principal atual

As rotas abaixo estao expostas hoje no shell autenticado:

- `/dashboard`
- `/inventory`
- `/inventory/entry`
- `/inventory/adjustment`
- `/inventory/transfer`
- `/inventory/units`
- `/stock-locations`
- `/cash`
- `/pdv`
- `/sales`
- `/sales/:id`
- `/sale-returns`
- `/sale-returns/new`
- `/sale-returns/:id`
- `/service-orders`
- `/service-orders/new`
- `/service-orders/:id`
- `/service-orders/:id/quotes/new`
- `/service-orders/:id/quotes/:quoteId/edit`
- `/purchase-orders`
- `/purchase-orders/new`
- `/purchase-orders/:id`
- `/financial`
- `/commissions/my`
- `/commissions/team`
- `/accounts-payable`
- `/accounts-receivable`
- `/reports`
- `/reports/sales`
- `/reports/stock`
- `/reports/cash`
- `/reports/customers`
- `/fiscal`
- `/products`
- `/services`
- `/customers`
- `/suppliers`
- `/categories`
- `/settings/store`

## Matriz por modulo

| Area | Modulo | Status | Shell | Observacoes |
| --- | --- | --- | --- | --- |
| Fundacao e acesso | Auth (`login`, `refresh`, `logout`, `auth/me`) | IMPLEMENTADO E FUNCIONAL | Sim | Sessao restaurada por refresh token e backend protegido. |
| Fundacao e acesso | Users | IMPLEMENTADO E FUNCIONAL | Nao | Backend e telas administrativas existem, mas o shell principal desta fase nao expoe o modulo. |
| Fundacao e acesso | Roles e permissions | IMPLEMENTADO E FUNCIONAL | Nao | RBAC real no backend e no frontend. |
| Fundacao e acesso | Stores/settings | IMPLEMENTADO E FUNCIONAL | Sim | Branding real da loja, leitura publica e atualizacao protegida. |
| Fundacao e acesso | Branding | IMPLEMENTADO E FUNCIONAL | Sim | ALPHA TECNOLOGIA aplicada ao login e shell por dados de `stores`. |
| Fundacao e acesso | Auditoria basica | IMPLEMENTADO E FUNCIONAL | Nao | Auth, cadastros, estoque, vendas e fiscal-core ja gravam auditoria. |
| Cadastro base | Customers | IMPLEMENTADO E FUNCIONAL | Sim | CRUD real com persistencia em PostgreSQL. |
| Cadastro base | Suppliers | IMPLEMENTADO E FUNCIONAL | Sim | CRUD real com persistencia em PostgreSQL. |
| Cadastro base | Categories | IMPLEMENTADO E FUNCIONAL | Sim | CRUD real com `prefix` e `sequenceName`. |
| Catalogo | Products | IMPLEMENTADO E FUNCIONAL | Sim | CRUD real, relacoes, upload local e detalhe real. |
| Catalogo | Services | IMPLEMENTADO E FUNCIONAL | Sim | Modelagem unica via `products.isService`. |
| Catalogo | Product codes / barcode | IMPLEMENTADO E FUNCIONAL | Sim | CRUD no escopo do produto, barcode da loja gerado para produto fisico e busca real por codigo. |
| Catalogo | Product units | IMPLEMENTADO E FUNCIONAL | Sim | Gestao operacional em `/inventory/units` com IMEI/serial e local atual. |
| Catalogo | Upload de imagem de produto | IMPLEMENTADO E FUNCIONAL | Sim | Upload local e URL refletida na UI. |
| Catalogo | Etiqueta pequena de produto | IMPLEMENTADO E FUNCIONAL | Sim | Preview e impressao web em `CODE 128` para loja fisica. |
| Estoque | Stock locations | IMPLEMENTADO E FUNCIONAL | Sim | CRUD/API real e local padrao. |
| Estoque | Inventory balances | IMPLEMENTADO E FUNCIONAL | Sim | Consulta real por produto, local e busca por IMEI/serial. |
| Estoque | Inventory movements | IMPLEMENTADO E FUNCIONAL | Sim | Historico rastreavel com tipos reais de movimento. |
| Estoque | Inventory entries | IMPLEMENTADO E FUNCIONAL | Sim | Entrada agregada para item comum e entrada serializada via unidades. |
| Estoque | Inventory adjustments | IMPLEMENTADO E FUNCIONAL | Sim | Ajuste real para nao serializado; serializado usa gestao de unidades. |
| Estoque | Inventory transfers | IMPLEMENTADO E FUNCIONAL | Sim | Transferencia agregada para nao serializado e transferencia unitaria para serializado. |
| Caixa e financeiro base | Cash | IMPLEMENTADO PARCIALMENTE | Sim | Fluxo real existe e passou no smoke, mas o bloco financeiro ainda segue em consolidacao final. |
| Caixa e financeiro base | Accounts payable | IMPLEMENTADO E FUNCIONAL | Sim | CRUD real, baixa operacional e vinculacao assistida com `purchase-orders`. |
| Caixa e financeiro base | Accounts receivable | IMPLEMENTADO E FUNCIONAL | Sim | CRUD real, recebimento operacional e vinculacao assistida com `service-orders` e `sales`. |
| Caixa e financeiro base | Financial summary | IMPLEMENTADO PARCIALMENTE | Sim | Resumo real, mas ainda no bloco de consolidacao gerencial/financeira. |
| Operacao comercial | PDV | IMPLEMENTADO E FUNCIONAL | Sim | Busca real por nome, barcode, `internal_code`, `supplier_code` e IMEI, local de estoque operacional, scanner mobile em tempo real e venda de item serializado por unidade. |
| Operacao comercial | Scanner mobile pareado ao PDV | IMPLEMENTADO E FUNCIONAL | Nao | Rota publica `/scanner`, sessao de pareamento, WebSocket realtime e leitura de barcode por camera do celular. |
| Operacao comercial | Sales | IMPLEMENTADO E FUNCIONAL | Sim | Checkout transacional, `sale_items`, `sale_payments`, listagem e detalhe reais. |
| Operacao comercial | Checkout transacional | IMPLEMENTADO E FUNCIONAL | Sim | Exige caixa aberto, baixa estoque por local e atualiza `product_units`. |
| Operacao comercial | Baixa de estoque na venda | IMPLEMENTADO E FUNCIONAL | Sim | Ocorre apenas para item fisico. |
| Operacao comercial | Atualizacao de `product_units` | IMPLEMENTADO E FUNCIONAL | Sim | Unidade serializada vai para `SOLD` e perde o local atual ao concluir a venda. |
| Gestao | Dashboard | IMPLEMENTADO PARCIALMENTE | Sim | Dados reais e graficos reais, mas o bloco gerencial ainda esta em consolidacao final. |
| Gestao | Reports | IMPLEMENTADO PARCIALMENTE | Sim | Relatorios reais com filtros e CSV, ainda em consolidacao final do bloco gerencial. |
| Gestao | Exportacoes CSV | IMPLEMENTADO PARCIALMENTE | Sim | Disponiveis nos reports atuais; cobertura ainda restrita aos relatorios implementados. |
| Gestao | Graficos alem do resumo inicial | IMPLEMENTADO PARCIALMENTE | Sim | Dashboard e relatorios ja usam dados reais, mas a camada gerencial ainda nao foi tratada como fechada. |
| Gestao | Auditoria complementar de reports/operacao | IMPLEMENTADO PARCIALMENTE | Nao | Reports e fiscal-core ja registram auditoria; falta ampliar a cobertura gerencial/comercial completa. |
| Fiscal | Fiscal core interno | IMPLEMENTADO E FUNCIONAL | Sim | Comprovante interno honesto, sem emissao SEFAZ, com tela fiscal explicita sobre esse limite e impressao termica por HTML. |
| Fiscal | Comprovante interno | IMPLEMENTADO E FUNCIONAL | Sim | Emissao por venda concluida, com `fiscal_documents`, `fiscal_events`, timeline visivel na venda e comprovante imprimivel em 80mm. |
| Fiscal | Cancelamento fiscal estruturado | IMPLEMENTADO E FUNCIONAL | Sim | Cancelamento rastreado, com motivo opcional, evento e atualizacao do status na venda. |
| Fiscal | Relatorio fiscal | IMPLEMENTADO E FUNCIONAL | Sim | Endpoint e tela reais com filtros basicos, totalizadores e leitura de eventos do documento. |
| Fiscal | `fiscal-config` | IMPLEMENTADO NO BANCO MAS NAO EXECUTAVEL | Nao | Estrutura no schema sem modulo operacional. |
| Fiscal | `fiscal-queue` / `fiscal_jobs` | IMPLEMENTADO NO BANCO MAS NAO EXECUTAVEL | Nao | Tabelas preparadas, sem fila operacional. |
| Fiscal | `fiscal_xml_storage` | IMPLEMENTADO NO BANCO MAS NAO EXECUTAVEL | Nao | Base preparada para armazenamento futuro. |
| Fiscal | `fiscal-emission` externo | NAO IMPLEMENTADO | Nao | Nao existe emissao SEFAZ executavel. |
| Fiscal | Integracao fiscal avancada com `sales` | IMPLEMENTADO PARCIALMENTE | Sim | Existe integracao interna de comprovante; emissao fiscal externa ainda nao existe. |
| Modulos avancados | Service orders core | IMPLEMENTADO E FUNCIONAL | Sim | Abertura, edicao, historico de status, itens operacionais, consumo de pecas com impacto em estoque e comprovante imprimivel. |
| Modulos avancados | Service order quotes | IMPLEMENTADO E FUNCIONAL | Sim | Orcamento dedicado por OS com criacao, edicao pendente, aprovacao e rejeicao. |
| Modulos avancados | Service order attachments | IMPLEMENTADO E FUNCIONAL | Sim | Upload local, listagem, preview/download e remocao de anexos da OS. |
| Modulos avancados | Purchase orders core | IMPLEMENTADO E FUNCIONAL | Sim | Criacao, alteracao de status, recebimento parcial/total e entrada real em estoque. |
| Modulos avancados | Sale returns | IMPLEMENTADO E FUNCIONAL | Sim | Devolucao vinculada a venda, retorno real ao estoque e reembolso operacional. |
| Modulos avancados | Commissions | IMPLEMENTADO E FUNCIONAL | Sim | Modulo basico com resumo pessoal, resumo da equipe, registro manual e metas mensais por usuario. |
| Modulos avancados | Printing | NAO IMPLEMENTADO | Nao | Nao ha modulo executavel nem contrato ativo. |

## Leitura correta da secao "o que ainda nao esta implementado"

Os itens abaixo nao devem mais ser tratados como "ausentes" de forma generica:

- `product_codes`: ja esta IMPLEMENTADO E FUNCIONAL
- `stock_locations`: ja esta IMPLEMENTADO E FUNCIONAL
- `product_units`: ja esta IMPLEMENTADO E FUNCIONAL
- `sales` com checkout transacional: ja esta IMPLEMENTADO E FUNCIONAL
- `telas frontend de products, inventory, stock-locations, cash, sales, pdv, accounts-payable, accounts-receivable, financial, reports e fiscal`: ja existem
- `exportacoes CSV`: ja existem nos reports implementados
- `graficos alem do resumo inicial`: ja existem no dashboard/relatorios atuais

Os itens que permanecem realmente pendentes ou parciais sao:

- consolidacao final de `cash`, `financial`, `dashboard`, `reports` e auditoria complementar
- `fiscal-config`, `fiscal-queue`, `fiscal-emission` e integracao fiscal avancada
- `printing`
