-- CreateEnum
CREATE TYPE "ProductCodeType" AS ENUM ('INTERNAL_BARCODE', 'MANUFACTURER_BARCODE', 'EAN13', 'CODE128', 'IMEI', 'SERIAL');

-- CreateEnum
CREATE TYPE "ProductCodeScope" AS ENUM ('PRODUCT', 'UNIT');

-- CreateEnum
CREATE TYPE "ProductUnitStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RESERVED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRY', 'EXIT', 'ADJUSTMENT', 'SALE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT');

-- AlterTable
ALTER TABLE "stock_movements"
ADD COLUMN     "product_unit_id" UUID,
ALTER COLUMN "movement_type" TYPE "StockMovementType" USING ("movement_type"::text::"StockMovementType");

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "supplier_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "brand" VARCHAR(120),
    "model" VARCHAR(120),
    "internal_code" VARCHAR(32) NOT NULL,
    "supplier_code" VARCHAR(64),
    "cost_price" INTEGER NOT NULL,
    "sale_price" INTEGER NOT NULL,
    "stock_min" INTEGER NOT NULL DEFAULT 0,
    "has_serial_control" BOOLEAN NOT NULL DEFAULT false,
    "needs_price_review" BOOLEAN NOT NULL DEFAULT false,
    "is_service" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_codes" (
    "id" UUID NOT NULL,
    "product_id" UUID,
    "product_unit_id" UUID,
    "code" VARCHAR(120) NOT NULL,
    "code_type" "ProductCodeType" NOT NULL,
    "scope" "ProductCodeScope" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_units" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "imei" VARCHAR(32),
    "imei2" VARCHAR(32),
    "serial_number" VARCHAR(80),
    "supplier_id" UUID,
    "purchase_price" INTEGER,
    "unit_status" "ProductUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_units_pkey" PRIMARY KEY ("id")
);

-- Create sequences for categories that may already exist before phase 3.
DO $$
DECLARE
    category_record RECORD;
BEGIN
    FOR category_record IN SELECT "sequence_name" FROM "categories"
    LOOP
        EXECUTE format(
            'CREATE SEQUENCE IF NOT EXISTS %I START WITH 1 INCREMENT BY 1',
            category_record.sequence_name
        );
    END LOOP;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "products_internal_code_key" ON "products"("internal_code");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_supplier_id_idx" ON "products"("supplier_id");

-- CreateIndex
CREATE INDEX "products_active_idx" ON "products"("active");

-- CreateIndex
CREATE INDEX "products_brand_idx" ON "products"("brand");

-- CreateIndex
CREATE INDEX "products_is_service_idx" ON "products"("is_service");

-- CreateIndex
CREATE UNIQUE INDEX "products_supplier_id_supplier_code_key" ON "products"("supplier_id", "supplier_code");

-- CreateIndex
CREATE UNIQUE INDEX "product_codes_code_key" ON "product_codes"("code");

-- CreateIndex
CREATE INDEX "product_codes_product_id_idx" ON "product_codes"("product_id");

-- CreateIndex
CREATE INDEX "product_codes_product_unit_id_idx" ON "product_codes"("product_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_imei_key" ON "product_units"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_imei2_key" ON "product_units"("imei2");

-- CreateIndex
CREATE UNIQUE INDEX "product_units_serial_number_key" ON "product_units"("serial_number");

-- CreateIndex
CREATE INDEX "product_units_product_id_idx" ON "product_units"("product_id");

-- CreateIndex
CREATE INDEX "product_units_supplier_id_idx" ON "product_units"("supplier_id");

-- CreateIndex
CREATE INDEX "product_units_unit_status_idx" ON "product_units"("unit_status");

-- CreateIndex
CREATE INDEX "stock_balances_product_id_idx" ON "stock_balances"("product_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_idx" ON "stock_movements"("product_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_unit_id_idx" ON "stock_movements"("product_unit_id");

-- Enforce core catalog and inventory invariants at the database layer.
ALTER TABLE "products"
ADD CONSTRAINT "products_cost_price_non_negative" CHECK ("cost_price" >= 0),
ADD CONSTRAINT "products_sale_price_non_negative" CHECK ("sale_price" >= 0),
ADD CONSTRAINT "products_stock_min_non_negative" CHECK ("stock_min" >= 0),
ADD CONSTRAINT "products_service_not_serialized" CHECK (NOT ("is_service" AND "has_serial_control")),
ADD CONSTRAINT "products_service_without_stock_min" CHECK (NOT ("is_service" AND "stock_min" > 0));

ALTER TABLE "stock_movements"
ADD CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_codes" ADD CONSTRAINT "product_codes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_codes" ADD CONSTRAINT "product_codes_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_unit_id_fkey" FOREIGN KEY ("product_unit_id") REFERENCES "product_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
