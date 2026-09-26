import { LocationType, type Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'location'>;
const ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] as Prisma.LocationOrderByWithRelationInput[];

/**
 * THE way to find "the" warehouse. The system has exactly one active warehouse (enforced by LocationsService), and every
 * lookup goes through here so the answer is deterministic even if data ever contained more than one: the oldest active
 * warehouse wins (then id), never "whichever row Postgres returns first".
 *
 * `includeInactive`: for work already in flight (dispatching an approved transfer, printing a delivery challan) a
 * deactivated warehouse is still the right place; new work (approvals, receipts, availability) needs an ACTIVE one.
 */
export async function findWarehouse(db: Db, opts: { includeInactive?: boolean } = {}) {
  const active = await db.location.findFirst({ where: { type: LocationType.WAREHOUSE, active: true }, orderBy: ORDER });
  if (active || !opts.includeInactive) return active;
  return db.location.findFirst({ where: { type: LocationType.WAREHOUSE }, orderBy: ORDER });
}
