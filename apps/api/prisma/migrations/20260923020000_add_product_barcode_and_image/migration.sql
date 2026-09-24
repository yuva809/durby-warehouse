-- AlterTable: Product.barcode (real EAN/GTIN/UPC, distinct from sku and
-- from any supplier-invoice-printed code) — nullable, unique when present.
ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateEnum
CREATE TYPE "ProductImageStatus" AS ENUM ('NOT_FOUND', 'FOUND_NEEDS_REVIEW', 'AUTO_MATCHED', 'VERIFIED', 'MANUAL_UPLOAD');

-- CreateTable: ProductImage — catalog enrichment only, one row per product.
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "ProductImageStatus" NOT NULL,
    "imageUrl" TEXT,
    "imageData" BYTEA,
    "imageMimeType" TEXT,
    "source" TEXT,
    "confidence" INTEGER,
    "matchedName" TEXT,
    "matchedBrand" TEXT,
    "matchedBarcode" TEXT,
    "attribution" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductImage_productId_key" ON "ProductImage"("productId");
CREATE INDEX "ProductImage_status_idx" ON "ProductImage"("status");
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
