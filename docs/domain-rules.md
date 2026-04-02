# Domain Rules

## Regras gerais

- dinheiro sempre em centavos
- `store_id` deve existir desde o inicio
- toda acao sensivel deve gerar auditoria
- operacoes criticas devem ser transacionais

## Codigo interno

- todo produto deve ter `internal_code`
- formato: `PREFIXO-000001`
- o prefixo vem de `categories.prefix`
- a numeracao deve usar PostgreSQL `SEQUENCE` por categoria
- nunca usar `MAX + 1`

## Codigos de produto

- um produto pode ter varios codigos
- um codigo deve ser unico no sistema
- deve existir suporte a codigo interno e codigo de fabricante
- leitura por codigo deve localizar produto imediatamente
- busca manual e fallback textual devem existir

## Produtos serializados

Produtos como celular, tablet, smartwatch e usados devem suportar controle unitario.

- venda exige selecao da unidade
- IMEI deve ser unico
- serial deve ser unico quando aplicavel
- unidade muda de `IN_STOCK` para `SOLD` no checkout
- consulta manual por IMEI deve funcionar no PDV

## Estoque

- `stock_balances` representa saldo consolidado
- `stock_movements` representa historico
- toda alteracao gera movimento
- `stock_movements.quantity` sempre positiva
- o sentido do movimento vem de `movement_type`
- ajuste exige motivo
- venda gera baixa automatica
- cancelamento e devolucao devem reverter saldo em fases futuras

## Caixa

- venda so pode acontecer com sessao de caixa aberta
- um terminal so pode ter uma sessao aberta por vez
- um usuario nao deve abrir duas sessoes simultaneas no mesmo terminal
- fechamento calcula diferenca automaticamente

## Venda

No MVP:

- carrinho fica no frontend
- backend recebe apenas o checkout
- a venda nasce finalizada

Ao concluir a venda, o backend deve em transacao unica:

- validar sessao de caixa aberta
- validar estoque
- validar unidades serializadas
- criar venda
- criar itens
- criar pagamentos
- criar movimentos de estoque
- criar movimentos de caixa
- atualizar status de unidade serializada
- registrar auditoria

## Seguranca

- senha sempre com hash
- refresh token salvo com hash
- usuario inativo nao loga
- backend valida permissoes
- frontend apenas oculta UI; nao substitui autorizacao
- somente OWNER cria outro OWNER
- MANAGER nao promove para OWNER

## Auditoria

- login deve gerar auditoria minima
- alteracoes de entidades sensiveis devem guardar autor, entidade e dados relevantes
- auditoria precisa ser consultavel por filtros

## Base fiscal futura

- preparar tabelas fiscais desde cedo
- manter status fiscal visivel nas vendas
- comprovante interno da loja pode existir
- nao emitir documento fiscal externo/SEFAZ nesta etapa
