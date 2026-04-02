-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('NFCE', 'NFE', 'RECEIPT', 'SERVICE_RECEIPT');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REJECTED', 'CANCELED', 'VOIDED', 'OFFLINE_PENDING');

-- CreateEnum
CREATE TYPE "FiscalEventType" AS ENUM ('CREATED', 'AUTHORIZED', 'REJECTED', 'CANCELED', 'XML_STORED', 'RESENT', 'OFFLINE_QUEUED');

-- CreateEnum
CREATE TYPE "XmlType" AS ENUM ('REQUEST', 'RESPONSE', 'AUTHORIZED_XML', 'CANCELED_XML');

-- CreateEnum
CREATE TYPE "SaleFiscalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'AUTHORIZED', 'REJECTED', 'CANCELED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "cest" VARCHAR(16),
ADD COLUMN     "cfop_default" VARCHAR(16),
ADD COLUMN     "ncm" VARCHAR(16),
ADD COLUMN     "origin_code" VARCHAR(16),
ADD COLUMN     "tax_category" VARCHAR(64),
ADD COLUMN     "tax_notes" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "fiscal_document_id" UUID,
ADD COLUMN     "fiscal_status" "SaleFiscalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "receipt_number" VARCHAR(32);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "access_key" VARCHAR(64),
    "series" VARCHAR(16),
    "number" VARCHAR(32),
    "environment" VARCHAR(24),
    "issue_payload" JSONB,
    "issued_at" TIMESTAMPTZ(6),
    "canceled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_events" (
    "id" UUID NOT NULL,
    "fiscal_document_id" UUID NOT NULL,
    "event_type" "FiscalEventType" NOT NULL,
    "description" VARCHAR(255),
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_xml_storage" (
    "id" UUID NOT NULL,
    "fiscal_document_id" UUID NOT NULL,
    "xml_type" "XmlType" NOT NULL,
    "xml_content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_xml_storage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_sale_id_key" ON "fiscal_documents"("sale_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_sale_id_idx" ON "fiscal_documents"("sale_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_store_id_idx" ON "fiscal_documents"("store_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_document_type_idx" ON "fiscal_documents"("document_type");

-- CreateIndex
CREATE INDEX "fiscal_documents_status_idx" ON "fiscal_documents"("status");

-- CreateIndex
CREATE INDEX "fiscal_events_fiscal_document_id_idx" ON "fiscal_events"("fiscal_document_id");

-- CreateIndex
CREATE INDEX "fiscal_events_event_type_idx" ON "fiscal_events"("event_type");

-- CreateIndex
CREATE INDEX "fiscal_xml_storage_fiscal_document_id_idx" ON "fiscal_xml_storage"("fiscal_document_id");

-- CreateIndex
CREATE INDEX "fiscal_xml_storage_xml_type_idx" ON "fiscal_xml_storage"("xml_type");

-- CreateIndex
CREATE UNIQUE INDEX "sales_fiscal_document_id_key" ON "sales"("fiscal_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_receipt_number_key" ON "sales"("receipt_number");

-- CreateIndex
CREATE INDEX "sales_fiscal_status_idx" ON "sales"("fiscal_status");

-- CreateIndex
CREATE INDEX "sales_fiscal_document_id_idx" ON "sales"("fiscal_document_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_events" ADD CONSTRAINT "fiscal_events_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_xml_storage" ADD CONSTRAINT "fiscal_xml_storage_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

