-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING', 'SALE', 'SUPPLY', 'WITHDRAWAL', 'CLOSING', 'REFUND');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'DEBIT', 'CREDIT', 'STORE_CREDIT');

-- CreateTable
CREATE TABLE "cash_terminals" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "cash_terminal_id" UUID NOT NULL,
    "opened_by" UUID,
    "closed_by" UUID,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opening_amount" INTEGER NOT NULL,
    "expected_amount" INTEGER,
    "closing_amount" INTEGER,
    "difference" INTEGER,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "movement_type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_method" "PaymentMethod",
    "reference_type" VARCHAR(80),
    "reference_id" UUID,
    "description" VARCHAR(255),
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "sale_number" VARCHAR(32) NOT NULL,
    "store_id" UUID NOT NULL,
    "customer_id" UUID,
    "user_id" UUID,
    "cash_session_id" UUID NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_unit_id" UUID,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "total_price" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "installments" INTEGER,
    "reference_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_refunds" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_terminals_store_id_idx" ON "cash_terminals"("store_id");

-- CreateIndex
CREATE INDEX "cash_terminals_active_idx" ON "cash_terminals"("active");

-- CreateIndex
CREATE UNIQUE INDEX "cash_terminals_store_id_name_key" ON "cash_terminals"("store_id", "name");

-- CreateIndex
CREATE INDEX "cash_sessions_cash_terminal_id_idx" ON "cash_sessions"("cash_terminal_id");

-- CreateIndex
CREATE INDEX "cash_sessions_status_idx" ON "cash_sessions"("status");

-- CreateIndex
CREATE INDEX "cash_sessions_opened_by_idx" ON "cash_sessions"("opened_by");

-- CreateIndex
CREATE INDEX "cash_sessions_closed_by_idx" ON "cash_sessions"("closed_by");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_one_open_per_terminal_key" ON "cash_sessions"("cash_terminal_id") WHERE "status" = 'OPEN';

-- CreateIndex
CREATE INDEX "cash_movements_cash_session_id_idx" ON "cash_movements"("cash_session_id");

-- CreateIndex
CREATE INDEX "cash_movements_movement_type_idx" ON "cash_movements"("movement_type");

-- CreateIndex
CREATE INDEX "cash_movements_user_id_idx" ON "cash_movements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_sale_number_key" ON "sales"("sale_number");

-- CreateIndex
CREATE INDEX "sales_store_id_idx" ON "sales"("store_id");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_user_id_idx" ON "sales"("user_id");

-- CreateIndex
CREATE INDEX "sales_cash_session_id_idx" ON "sales"("cash_session_id");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sales_completed_at_idx" ON "sales"("completed_at");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_items_product_unit_id_idx" ON "sale_items"("product_unit_id");

-- CreateIndex
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payments_method_idx" ON "sale_payments"("method");

-- CreateIndex
CREATE INDEX "sale_refunds_sale_id_idx" ON "sale_refunds"("sale_id");

-- CreateIndex
CREATE INDEX "sale_refunds_created_by_idx" ON "sale_refunds"("created_by");

-- Enforce cash and sales invariants at the database layer.
ALTER TABLE "cash_sessions"
ADD CONSTRAINT "cash_sessions_opening_amount_non_negative" CHECK ("opening_amount" >= 0),
ADD CONSTRAINT "cash_sessions_expected_amount_non_negative" CHECK ("expected_amount" IS NULL OR "expected_amount" >= 0),
ADD CONSTRAINT "cash_sessions_closing_amount_non_negative" CHECK ("closing_amount" IS NULL OR "closing_amount" >= 0);

ALTER TABLE "cash_movements"
ADD CONSTRAINT "cash_movements_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "sales"
ADD CONSTRAINT "sales_subtotal_non_negative" CHECK ("subtotal" >= 0),
ADD CONSTRAINT "sales_discount_amount_non_negative" CHECK ("discount_amount" >= 0),
ADD CONSTRAINT "sales_total_non_negative" CHECK ("total" >= 0);

ALTER TABLE "sale_items"
ADD CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0),
ADD CONSTRAINT "sale_items_unit_price_non_negative" CHECK ("unit_price" >= 0),
ADD CONSTRAINT "sale_items_discount_amount_non_negative" CHECK ("discount_amount" >= 0),
ADD CONSTRAINT "sale_items_total_price_non_negative" CHECK ("total_price" >= 0);

ALTER TABLE "sale_payments"
ADD CONSTRAINT "sale_payments_amount_positive" CHECK ("amount" > 0),
ADD CONSTRAINT "sale_payments_installments_positive" CHECK ("installments" IS NULL OR "installments" > 0);

ALTER TABLE "sale_refunds"
ADD CONSTRAINT "sale_refunds_amount_positive" CHECK ("amount" > 0);

-- AddForeignKey
ALTER TABLE "cash_terminals" ADD CONSTRAINT "cash_terminals_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cash_terminal_id_fkey" FOREIGN KEY ("cash_terminal_id") REFERENCES "cash_terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_refunds" ADD CONSTRAINT "sale_refunds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
