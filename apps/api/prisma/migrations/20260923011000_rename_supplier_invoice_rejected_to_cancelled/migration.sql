-- The SupplierInvoice table was created empty in the previous migration
-- (this feature hasn't shipped yet), so this rename is safe with no data
-- impact — aligning the enum value with the product spec's exact wording
-- ("Draft / Under Review / Confirmed / Cancelled").
ALTER TYPE "SupplierInvoiceStatus" RENAME VALUE 'REJECTED' TO 'CANCELLED';
