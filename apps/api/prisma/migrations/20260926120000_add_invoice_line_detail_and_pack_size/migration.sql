-- Additive only: every new column is nullable or has a default, so existing products, invoices and workflows are unaffected.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "packSize" INTEGER;

-- AlterTable
ALTER TABLE "SupplierInvoice" ADD COLUMN "invoiceTotal" DECIMAL(12,2),
ADD COLUMN "linesTotal" DECIMAL(12,2),
ADD COLUMN "currency" TEXT;

-- AlterTable
ALTER TABLE "SupplierInvoiceItem" ADD COLUMN "packSize" INTEGER,
ADD COLUMN "totalUnits" INTEGER,
ADD COLUMN "unitPrice" DECIMAL(12,4),
ADD COLUMN "priceBasis" TEXT,
ADD COLUMN "lineAmount" DECIMAL(12,2),
ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "batchNumber" TEXT,
ADD COLUMN "expiryDate" TIMESTAMP(3);
