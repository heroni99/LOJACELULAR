DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_codes_scope_reference_check'
  ) THEN
    ALTER TABLE "product_codes"
    ADD CONSTRAINT "product_codes_scope_reference_check"
    CHECK (
      (
        "scope" = 'PRODUCT'
        AND "product_id" IS NOT NULL
        AND "product_unit_id" IS NULL
      )
      OR
      (
        "scope" = 'UNIT'
        AND "product_unit_id" IS NOT NULL
        AND "product_id" IS NULL
      )
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "product_codes_product_primary_unique"
ON "product_codes" ("product_id")
WHERE "is_primary" = true AND "product_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "product_codes_unit_primary_unique"
ON "product_codes" ("product_unit_id")
WHERE "is_primary" = true AND "product_unit_id" IS NOT NULL;
