-- CreateEnum
CREATE TYPE "ScannerSessionStatus" AS ENUM (
  'WAITING_DESKTOP',
  'WAITING_SCANNER',
  'CONNECTED',
  'CLOSED',
  'EXPIRED'
);

-- CreateTable
CREATE TABLE "scanner_sessions" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "cash_session_id" UUID NOT NULL,
  "cash_terminal_id" UUID NOT NULL,
  "desktop_user_id" UUID,
  "pairing_code" VARCHAR(16) NOT NULL,
  "pairing_token_hash" VARCHAR(128) NOT NULL,
  "status" "ScannerSessionStatus" NOT NULL DEFAULT 'WAITING_DESKTOP',
  "connected_desktop_at" TIMESTAMPTZ(6),
  "connected_scanner_at" TIMESTAMPTZ(6),
  "last_read_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "closed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "scanner_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scanner_sessions_pairing_code_key" ON "scanner_sessions"("pairing_code");

-- CreateIndex
CREATE UNIQUE INDEX "scanner_sessions_pairing_token_hash_key" ON "scanner_sessions"("pairing_token_hash");

-- CreateIndex
CREATE INDEX "scanner_sessions_store_id_idx" ON "scanner_sessions"("store_id");

-- CreateIndex
CREATE INDEX "scanner_sessions_cash_session_id_idx" ON "scanner_sessions"("cash_session_id");

-- CreateIndex
CREATE INDEX "scanner_sessions_cash_terminal_id_idx" ON "scanner_sessions"("cash_terminal_id");

-- CreateIndex
CREATE INDEX "scanner_sessions_desktop_user_id_idx" ON "scanner_sessions"("desktop_user_id");

-- CreateIndex
CREATE INDEX "scanner_sessions_status_idx" ON "scanner_sessions"("status");

-- CreateIndex
CREATE INDEX "scanner_sessions_expires_at_idx" ON "scanner_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "scanner_sessions"
ADD CONSTRAINT "scanner_sessions_store_id_fkey"
FOREIGN KEY ("store_id") REFERENCES "stores"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_sessions"
ADD CONSTRAINT "scanner_sessions_cash_session_id_fkey"
FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_sessions"
ADD CONSTRAINT "scanner_sessions_cash_terminal_id_fkey"
FOREIGN KEY ("cash_terminal_id") REFERENCES "cash_terminals"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanner_sessions"
ADD CONSTRAINT "scanner_sessions_desktop_user_id_fkey"
FOREIGN KEY ("desktop_user_id") REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
