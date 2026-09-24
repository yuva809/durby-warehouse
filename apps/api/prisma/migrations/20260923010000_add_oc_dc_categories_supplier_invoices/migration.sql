-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'CONFIRMED', 'REJECTED');

-- Seed the new customer-facing document number sequences. Start at 0 so the
-- first call to CodesService.next('OC'|'DC'|'INV') returns 1 (-> "-000001").
INSERT INTO "CodeSequence" ("prefix", "value") VALUES ('OC', 0), ('DC', 0), ('INV', 0)
ON CONFLICT ("prefix") DO NOTHING;

-- CreateTable: ProductCategory
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "ProductCategory"("name");

-- Backfill: one ProductCategory row per distinct existing Product.category
-- string, so the new category-browsing UX has real data from day one
-- without duplicating or losing anything already on Product.category.
INSERT INTO "ProductCategory" ("id", "name", "displayOrder", "updatedAt")
SELECT 'cat_' || lpad(row_number() OVER (ORDER BY category)::text, 8, '0'), category, row_number() OVER (ORDER BY category), now()
FROM (SELECT DISTINCT category FROM "Product") d;

-- AlterTable: Product.categoryId (nullable FK, additive — Product.category
-- string column is untouched)
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;
UPDATE "Product" p SET "categoryId" = pc."id" FROM "ProductCategory" pc WHERE pc."name" = p."category";
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: StockRequest.ocNumber — backfilled for existing rows in
-- createdAt order, then made NOT NULL + UNIQUE, matching how it behaves for
-- every request created from now on.
ALTER TABLE "StockRequest" ADD COLUMN "ocNumber" TEXT;
UPDATE "StockRequest" sr SET "ocNumber" = 'OC-' || lpad(sub.rn::text, 6, '0')
FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn FROM "StockRequest") sub
WHERE sr."id" = sub."id";
ALTER TABLE "StockRequest" ALTER COLUMN "ocNumber" SET NOT NULL;
CREATE UNIQUE INDEX "StockRequest_ocNumber_key" ON "StockRequest"("ocNumber");
UPDATE "CodeSequence" SET "value" = GREATEST("value", (SELECT COUNT(*) FROM "StockRequest")) WHERE "prefix" = 'OC';

-- AlterTable: Transfer.dcNumber — nullable (only assigned at dispatch time
-- going forward); backfilled here only for transfers that have already been
-- dispatched (outForDeliveryAt is set), in dispatch order, so existing
-- delivery history stays numbered consistently instead of leaving a gap.
ALTER TABLE "Transfer" ADD COLUMN "dcNumber" TEXT;
UPDATE "Transfer" t SET "dcNumber" = 'DC-' || lpad(sub.rn::text, 6, '0')
FROM (SELECT "id", row_number() OVER (ORDER BY "outForDeliveryAt", "id") AS rn FROM "Transfer" WHERE "outForDeliveryAt" IS NOT NULL) sub
WHERE t."id" = sub."id";
CREATE UNIQUE INDEX "Transfer_dcNumber_key" ON "Transfer"("dcNumber");
UPDATE "CodeSequence" SET "value" = GREATEST("value", (SELECT COUNT(*) FROM "Transfer" WHERE "outForDeliveryAt" IS NOT NULL)) WHERE "prefix" = 'DC';

-- CreateTable: SupplierInvoice
CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceFileName" TEXT,
    "sourceFileType" TEXT,
    "sourceFileData" BYTEA,
    "uploadedById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierInvoice_code_key" ON "SupplierInvoice"("code");
CREATE INDEX "SupplierInvoice_status_idx" ON "SupplierInvoice"("status");
CREATE INDEX "SupplierInvoice_createdAt_idx" ON "SupplierInvoice"("createdAt");
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: SupplierInvoiceItem
CREATE TABLE "SupplierInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "rawDescription" TEXT NOT NULL,
    "rawProductCode" TEXT,
    "unit" TEXT,
    "invoiceQty" INTEGER NOT NULL,
    "receivedQty" INTEGER,
    "matchConfidence" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "SupplierInvoiceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierInvoiceItem_invoiceId_idx" ON "SupplierInvoiceItem"("invoiceId");
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
