CREATE SEQUENCE IF NOT EXISTS "seq_service_orders_number" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "seq_purchase_orders_number" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "seq_sale_returns_number" START WITH 1 INCREMENT BY 1;

ALTER TABLE "service_orders" ADD COLUMN "order_number" VARCHAR(32);
ALTER TABLE "purchase_orders" ADD COLUMN "order_number" VARCHAR(32);
ALTER TABLE "sale_returns" ADD COLUMN "return_number" VARCHAR(32);

UPDATE "service_orders"
SET "order_number" = 'SO-' || LPAD(nextval('seq_service_orders_number')::text, 6, '0')
WHERE "order_number" IS NULL;

UPDATE "purchase_orders"
SET "order_number" = 'PO-' || LPAD(nextval('seq_purchase_orders_number')::text, 6, '0')
WHERE "order_number" IS NULL;

UPDATE "sale_returns"
SET "return_number" = 'SR-' || LPAD(nextval('seq_sale_returns_number')::text, 6, '0')
WHERE "return_number" IS NULL;

ALTER TABLE "service_orders" ALTER COLUMN "order_number" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "order_number" SET NOT NULL;
ALTER TABLE "sale_returns" ALTER COLUMN "return_number" SET NOT NULL;

CREATE UNIQUE INDEX "service_orders_order_number_key" ON "service_orders"("order_number");
CREATE INDEX "service_orders_order_number_idx" ON "service_orders"("order_number");

CREATE UNIQUE INDEX "purchase_orders_order_number_key" ON "purchase_orders"("order_number");
CREATE INDEX "purchase_orders_order_number_idx" ON "purchase_orders"("order_number");

CREATE UNIQUE INDEX "sale_returns_return_number_key" ON "sale_returns"("return_number");
CREATE INDEX "sale_returns_return_number_idx" ON "sale_returns"("return_number");
