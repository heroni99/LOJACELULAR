-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "accent_color" VARCHAR(16) NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "banner_url" VARCHAR(255),
ADD COLUMN     "display_name" VARCHAR(120) NOT NULL DEFAULT 'LojaCelular',
ADD COLUMN     "hero_banner_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logo_url" VARCHAR(255),
ADD COLUMN     "primary_color" VARCHAR(16) NOT NULL DEFAULT '#f97316',
ADD COLUMN     "secondary_color" VARCHAR(16) NOT NULL DEFAULT '#111827';

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "cpf_cnpj" VARCHAR(32),
    "email" VARCHAR(160),
    "phone" VARCHAR(32) NOT NULL,
    "phone2" VARCHAR(32),
    "zip_code" VARCHAR(16),
    "address" VARCHAR(255),
    "city" VARCHAR(120),
    "state" VARCHAR(8),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "trade_name" VARCHAR(120),
    "cnpj" VARCHAR(32),
    "state_registration" VARCHAR(32),
    "email" VARCHAR(160),
    "phone" VARCHAR(32),
    "contact_name" VARCHAR(120),
    "zip_code" VARCHAR(16),
    "address" VARCHAR(255),
    "city" VARCHAR(120),
    "state" VARCHAR(8),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "description" TEXT,
    "default_serialized" BOOLEAN NOT NULL DEFAULT false,
    "sequence_name" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "movement_type" VARCHAR(40) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" INTEGER,
    "reference_type" VARCHAR(80),
    "reference_id" UUID,
    "notes" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_active_idx" ON "customers"("active");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "suppliers_active_idx" ON "suppliers"("active");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_prefix_key" ON "categories"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "categories_sequence_name_key" ON "categories"("sequence_name");

-- CreateIndex
CREATE INDEX "categories_active_idx" ON "categories"("active");

-- CreateIndex
CREATE INDEX "stock_locations_store_id_idx" ON "stock_locations"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_store_id_name_key" ON "stock_locations"("store_id", "name");

-- CreateIndex
CREATE INDEX "stock_balances_location_id_idx" ON "stock_balances"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_product_id_location_id_key" ON "stock_balances"("product_id", "location_id");

-- CreateIndex
CREATE INDEX "stock_movements_location_id_idx" ON "stock_movements"("location_id");

-- CreateIndex
CREATE INDEX "stock_movements_user_id_idx" ON "stock_movements"("user_id");

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
