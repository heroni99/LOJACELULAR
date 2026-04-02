-- CreateEnum
CREATE TYPE "FiscalEnvironment" AS ENUM ('HOMOLOGATION', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ContingencyMode" AS ENUM ('NONE', 'OFFLINE', 'SVC', 'FS_DA');

-- CreateEnum
CREATE TYPE "FiscalJobType" AS ENUM ('ISSUE_DOCUMENT', 'REPROCESS_DOCUMENT', 'CANCEL_DOCUMENT', 'VOID_NUMBER');

-- CreateEnum
CREATE TYPE "FiscalJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FiscalDocumentStatus" ADD VALUE 'QUEUED';
ALTER TYPE "FiscalDocumentStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "FiscalDocumentStatus" ADD VALUE 'ERROR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FiscalEventType" ADD VALUE 'QUEUED';
ALTER TYPE "FiscalEventType" ADD VALUE 'SENT';
ALTER TYPE "FiscalEventType" ADD VALUE 'CONTINGENCY_PRINTED';
ALTER TYPE "FiscalEventType" ADD VALUE 'NUMBER_RESERVED';
ALTER TYPE "FiscalEventType" ADD VALUE 'NUMBER_VOIDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SaleFiscalStatus" ADD VALUE 'QUEUED';
ALTER TYPE "SaleFiscalStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "SaleFiscalStatus" ADD VALUE 'OFFLINE_PENDING';
ALTER TYPE "SaleFiscalStatus" ADD VALUE 'ERROR';

-- AlterTable
ALTER TABLE "fiscal_documents" ADD COLUMN     "authorization_message" TEXT,
ADD COLUMN     "authorized_at" TIMESTAMPTZ(6),
ADD COLUMN     "authorized_xml" TEXT,
ADD COLUMN     "cancel_xml" TEXT,
ADD COLUMN     "contingency_mode" "ContingencyMode",
ADD COLUMN     "protocol_number" VARCHAR(64),
ADD COLUMN     "qr_code_url" VARCHAR(1024),
ADD COLUMN     "receipt_number" VARCHAR(32),
ADD COLUMN     "rejection_code" VARCHAR(32),
ADD COLUMN     "rejection_message" TEXT,
ADD COLUMN     "request_xml" TEXT,
ADD COLUMN     "response_xml" TEXT;

-- Preserve any existing textual environment values when moving to the enum.
ALTER TABLE "fiscal_documents"
ALTER COLUMN "environment" TYPE "FiscalEnvironment"
USING CASE
    WHEN "environment" IS NULL THEN NULL
    WHEN UPPER("environment") = 'HOMOLOGATION' THEN 'HOMOLOGATION'::"FiscalEnvironment"
    WHEN UPPER("environment") = 'PRODUCTION' THEN 'PRODUCTION'::"FiscalEnvironment"
    ELSE NULL
END;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "fiscal_error" TEXT,
ADD COLUMN     "requires_fiscal_document" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "fiscal_config" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'HOMOLOGATION',
    "document_series_nfce" VARCHAR(16),
    "document_series_nfe" VARCHAR(16),
    "next_number_nfce" INTEGER,
    "next_number_nfe" INTEGER,
    "csc_id" VARCHAR(32),
    "csc_token" VARCHAR(255),
    "responsible_technical_cnpj" VARCHAR(32),
    "responsible_technical_contact" VARCHAR(120),
    "responsible_technical_email" VARCHAR(160),
    "responsible_technical_phone" VARCHAR(32),
    "certificate_path" VARCHAR(255),
    "certificate_password" VARCHAR(255),
    "default_contingency_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiscal_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_jobs" (
    "id" UUID NOT NULL,
    "fiscal_document_id" UUID NOT NULL,
    "job_type" "FiscalJobType" NOT NULL,
    "status" "FiscalJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "run_after" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiscal_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_config_store_id_key" ON "fiscal_config"("store_id");

-- CreateIndex
CREATE INDEX "fiscal_config_environment_idx" ON "fiscal_config"("environment");

-- CreateIndex
CREATE INDEX "fiscal_jobs_fiscal_document_id_idx" ON "fiscal_jobs"("fiscal_document_id");

-- CreateIndex
CREATE INDEX "fiscal_jobs_job_type_idx" ON "fiscal_jobs"("job_type");

-- CreateIndex
CREATE INDEX "fiscal_jobs_status_idx" ON "fiscal_jobs"("status");

-- CreateIndex
CREATE INDEX "fiscal_jobs_run_after_idx" ON "fiscal_jobs"("run_after");

-- CreateIndex
CREATE INDEX "fiscal_jobs_status_run_after_idx" ON "fiscal_jobs"("status", "run_after");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_access_key_key" ON "fiscal_documents"("access_key");

-- CreateIndex
CREATE INDEX "fiscal_documents_environment_idx" ON "fiscal_documents"("environment");

-- CreateIndex
CREATE INDEX "fiscal_documents_receipt_number_idx" ON "fiscal_documents"("receipt_number");

-- CreateIndex
CREATE INDEX "fiscal_documents_protocol_number_idx" ON "fiscal_documents"("protocol_number");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_store_id_document_type_environment_series__key" ON "fiscal_documents"("store_id", "document_type", "environment", "series", "number");

-- CreateIndex
CREATE INDEX "sales_requires_fiscal_document_idx" ON "sales"("requires_fiscal_document");

-- AddForeignKey
ALTER TABLE "fiscal_config" ADD CONSTRAINT "fiscal_config_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_jobs" ADD CONSTRAINT "fiscal_jobs_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
