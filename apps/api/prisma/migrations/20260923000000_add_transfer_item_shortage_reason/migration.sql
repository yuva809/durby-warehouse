-- Records why a driver picked fewer units than the warehouse manager
-- approved (damaged, rotten, out of stock at pick time, etc). Nullable —
-- only meaningful when pickedQty < approvedQty, enforced in the service
-- layer, not by a DB constraint (a CHECK across two nullable columns with
-- conditional NULL-ness isn't worth the complexity here).
ALTER TABLE "TransferItem" ADD COLUMN "shortageReason" TEXT;
