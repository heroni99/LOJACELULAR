CREATE UNIQUE INDEX "service_order_quotes_active_unique_idx"
ON "service_order_quotes" ("service_order_id")
WHERE "status" IN ('PENDING', 'APPROVED');
