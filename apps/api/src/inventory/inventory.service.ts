import { ConflictException, Injectable } from '@nestjs/common';
import type { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export class InsufficientStockException extends ConflictException {
  constructor(productId: string, locationId: string, requested: number, available: number) {
    super({
      message: `Insufficient available stock for product ${productId} at location ${locationId}`,
      productId,
      locationId,
      requested,
      available,
    });
  }
}

/**
 * The only code in the system allowed to change onHand/reserved. Every
 * method here does its work as ONE conditional UPDATE (never a JS
 * read-then-write), so Postgres's row lock is what actually prevents two
 * concurrent callers from both succeeding against the same stock — see the
 * WHERE clauses below. Call these from inside a Prisma interactive
 * transaction ($transaction(async (tx) => ...)) whenever more than one
 * inventory/DB change must be all-or-nothing.
 */
@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getAvailable(locationId: string, productId: string, tx?: Tx) {
    const client = tx ?? this.prisma;
    const item = await client.inventoryItem.findUnique({
      where: { locationId_productId: { locationId, productId } },
    });
    if (!item) return { onHand: 0, reserved: 0, available: 0 };
    return { onHand: item.onHand, reserved: item.reserved, available: item.onHand - item.reserved };
  }

  /**
   * available -> reserved. Atomic: the WHERE clause re-checks availability
   * at the moment of the UPDATE, not at the moment the caller last read it.
   * If two requests race for the last units, only the one whose UPDATE
   * commits first affects a row; the other affects zero rows and this
   * throws, causing its whole transaction to roll back.
   */
  async reserve(tx: Tx, locationId: string, productId: string, qty: number) {
    if (qty <= 0) return;
    const rows = await tx.$queryRaw<{ onHand: number; reserved: number }[]>`
      UPDATE "InventoryItem"
      SET "reserved" = "reserved" + ${qty}, "updatedAt" = now()
      WHERE "locationId" = ${locationId} AND "productId" = ${productId}
        AND ("onHand" - "reserved") >= ${qty}
      RETURNING "onHand", "reserved"
    `;
    if (rows.length === 0) {
      const current = await this.getAvailable(locationId, productId, tx);
      throw new InsufficientStockException(productId, locationId, qty, current.available);
    }
  }

  /** Releases a hold without moving physical stock (cancel, reject, or converting a reservation into an actual movement). */
  async releaseReservation(tx: Tx, locationId: string, productId: string, qty: number) {
    if (qty <= 0) return;
    await tx.$executeRaw`
      UPDATE "InventoryItem"
      SET "reserved" = GREATEST("reserved" - ${qty}, 0), "updatedAt" = now()
      WHERE "locationId" = ${locationId} AND "productId" = ${productId}
    `;
  }

  /**
   * Applies a physical stock change (signed delta) and writes the matching
   * ledger row in the same call. This is the ONLY way onHand ever changes —
   * there is no path in this service that mutates onHand without also
   * inserting an InventoryMovement.
   */
  async applyMovement(
    tx: Tx,
    params: {
      locationId: string;
      productId: string;
      quantity: number; // signed delta to onHand
      type: MovementType;
      reference?: string;
      reason?: string;
      userId?: string;
    },
  ) {
    const { locationId, productId, quantity, type, reference, reason, userId } = params;
    if (quantity === 0) return;

    const rows = await tx.$queryRaw<{ onHand: number }[]>`
      UPDATE "InventoryItem"
      SET "onHand" = "onHand" + ${quantity}, "updatedAt" = now()
      WHERE "locationId" = ${locationId} AND "productId" = ${productId}
        AND ("onHand" + ${quantity}) >= 0
      RETURNING "onHand"
    `;
    if (rows.length === 0) {
      const current = await this.getAvailable(locationId, productId, tx);
      throw new InsufficientStockException(productId, locationId, -quantity, current.onHand);
    }

    await tx.inventoryMovement.create({
      data: { locationId, productId, quantity, type, reference, reason, userId },
    });
  }

  /** Ensures an InventoryItem row exists for a (location, product) pair — used by seeding and product/location creation. */
  async ensureRow(tx: Tx, locationId: string, productId: string) {
    await tx.inventoryItem.upsert({
      where: { locationId_productId: { locationId, productId } },
      update: {},
      create: { locationId, productId, onHand: 0, reserved: 0 },
    });
  }
}
