import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestStatus, Role, TransferStatus, MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ActivityService } from '../activity/activity.service';
import { CodesService } from '../common/codes.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { DeliveredItemDto, SetPickedQtyDto } from './dto/transfer.dto';

const IN_FLIGHT_FAILABLE: TransferStatus[] = [TransferStatus.ASSIGNED, TransferStatus.PICKING, TransferStatus.OUT_FOR_DELIVERY];

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private activity: ActivityService,
    private codes: CodesService,
  ) {}

  /**
   * The one customer-facing identifier for a transfer in activity messages:
   * its DC number once one exists (assigned at dispatch), otherwise the
   * order it belongs to — never the internal TR- code. Same "OC = order,
   * DC = delivery" rule as the PDFs and every user-facing screen.
   */
  private docLabel(transfer: { dcNumber: string | null; request: { ocNumber: string } }) {
    return transfer.dcNumber ?? `Order ${transfer.request.ocNumber}`;
  }

  private async assertAccess(user: AuthUser, transfer: { branchId: string; driverId: string | null }) {
    if (user.role === Role.BRANCH_USER && user.locationId !== transfer.branchId) {
      throw new ForbiddenException("You don't have access to this transfer");
    }
    if (user.role === Role.DRIVER && transfer.driverId !== user.userId) {
      throw new ForbiddenException('This delivery is not assigned to you');
    }
  }

  async list(user: AuthUser) {
    const where: Record<string, unknown> = {};
    if (user.role === Role.BRANCH_USER) {
      if (!user.locationId) return [];
      where.branchId = user.locationId;
    }
    if (user.role === Role.DRIVER) {
      // A driver only ever sees deliveries assigned to them — enforced here,
      // at the query, not just hidden in a UI, so there is no way to reach
      // another driver's transfer even by guessing an ID (get() below
      // re-checks this too for direct-by-id access).
      where.driverId = user.userId;
    }

    return this.prisma.transfer.findMany({
      where,
      include: { items: { include: { product: true } }, branch: true, driver: { select: { id: true, name: true } }, request: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, branch: true, driver: { select: { id: true, name: true } }, request: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    await this.assertAccess(user, transfer);
    return transfer;
  }

  /**
   * Read-then-write, same as the other pure metadata/reassignment
   * transitions below — but this one picks WHICH driver a transfer belongs
   * to, so a race between two managers assigning different drivers could
   * otherwise silently leave the "wrong" one attached with no error to
   * either caller. Claimed atomically for that reason; no inventory is
   * touched here so the stakes are lower than dispatch/markDelivered, but
   * the fix is the same one line of raw SQL.
   */
  async assignDriver(id: string, driverId: string, user: AuthUser) {
    const driver = await this.prisma.user.findUnique({ where: { id: driverId } });
    if (!driver || driver.role !== Role.DRIVER || !driver.active) {
      throw new ConflictException('driverId must reference an active driver');
    }
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id } });
    if (transfer.status !== TransferStatus.READY && transfer.status !== TransferStatus.ASSIGNED) {
      throw new ConflictException(`Cannot assign a driver to a transfer in status ${transfer.status}`);
    }

    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Transfer"
      SET "driverId" = ${driverId}, "status" = 'ASSIGNED'::"TransferStatus", "updatedAt" = now()
      WHERE "id" = ${id} AND "status" IN ('READY', 'ASSIGNED')
      RETURNING "id"
    `;
    if (claimed.length === 0) {
      throw new ConflictException(`Cannot assign a driver to a transfer in status ${transfer.status}`);
    }

    const updated = await this.prisma.transfer.findUniqueOrThrow({ where: { id }, include: { request: { select: { ocNumber: true } } } });
    await this.activity.log(`Driver ${driver.name} assigned to ${this.docLabel(updated)}`, 'transfer', user.userId);
    return updated;
  }

  async startPicking(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
    await this.assertAccess(user, transfer);
    if (transfer.status !== TransferStatus.ASSIGNED) {
      throw new ConflictException(`Cannot start picking a transfer in status ${transfer.status}`);
    }
    // Pre-fill each line with the approved (planned) quantity rather than
    // leaving it blank — the driver is then editing only the lines that came
    // up short, not re-typing every quantity from scratch. This is still
    // just a starting value: setPickedQty can change it before dispatch()
    // reads whatever is persisted at that moment as authoritative.
    //
    // Not given an atomic status guard like dispatch/markDelivered: a
    // concurrent double-call here re-writes every line to the same
    // approvedQty value and sets the same PICKING status both times —
    // genuinely idempotent, no inventory touched, nothing to corrupt.
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        await tx.transferItem.update({
          where: { transferId_productId: { transferId: id, productId: item.productId } },
          data: { pickedQty: item.approvedQty, shortageReason: null },
        });
      }
      return tx.transfer.update({
        where: { id },
        data: { status: TransferStatus.PICKING },
        include: { items: true, request: { select: { ocNumber: true } } },
      });
    });
    await this.activity.log(`Driver started picking for ${this.docLabel(updated)}`, 'delivery', user.userId);
    return updated;
  }

  /**
   * Draft-only: records what the driver counted so far. No inventory effect
   * until dispatch(). A race here just means "whichever value was typed
   * last wins" — the same semantics as if the driver had typed it once —
   * and dispatch() re-reads whatever is persisted at that moment, guarded
   * by its own atomic transition. Nothing to fix here.
   */
  async setPickedQty(id: string, dto: SetPickedQtyDto, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
    await this.assertAccess(user, transfer);
    if (transfer.status !== TransferStatus.PICKING) {
      throw new ConflictException(`Cannot record picked quantity for a transfer in status ${transfer.status}`);
    }
    const item = transfer.items.find((i) => i.productId === dto.productId);
    if (!item) throw new NotFoundException('That product is not on this transfer');
    if (dto.pickedQty > item.approvedQty) {
      throw new ConflictException(`Picked quantity (${dto.pickedQty}) cannot exceed the approved quantity (${item.approvedQty})`);
    }
    const isShort = dto.pickedQty < item.approvedQty;
    if (isShort && !dto.reason?.trim()) {
      throw new ConflictException('A reason is required when picked quantity is less than approved quantity');
    }
    return this.prisma.transferItem.update({
      where: { transferId_productId: { transferId: id, productId: dto.productId } },
      data: { pickedQty: dto.pickedQty, shortageReason: isShort ? dto.reason!.trim() : null },
    });
  }

  /**
   * "Start Delivery." The one transaction that turns a reservation into a
   * real stock movement. The PICKING -> OUT_FOR_DELIVERY transition is
   * claimed with a single conditional UPDATE ("WHERE status = 'PICKING'")
   * inside this same transaction — the same pattern InventoryService uses
   * for stock — so two concurrent dispatch() calls (double-click, a
   * network retry, literally two requests arriving at once) cannot both
   * pass. Only the caller whose UPDATE actually matches the row proceeds to
   * touch inventory; the other gets zero rows back and rolls back before
   * ever calling applyMovement, so at most one TRANSFER_OUT is ever
   * created for a given dispatch. pickedQty — not approvedQty — is what
   * leaves the building.
   */
  async dispatch(id: string, user: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({ where: { id }, include: { items: true, branch: true } });
      if (!transfer) throw new NotFoundException('Transfer not found');
      await this.assertAccess(user, transfer);
      if (transfer.status !== TransferStatus.PICKING) {
        throw new ConflictException(`Cannot dispatch a transfer in status ${transfer.status}`);
      }
      for (const item of transfer.items) {
        if (item.pickedQty === null) {
          throw new ConflictException(`Picked quantity has not been recorded for product ${item.productId}`);
        }
      }

      // Atomic claim — the actual concurrency guard. Everything above this
      // is just an early, friendlier error for the non-racing case.
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Transfer"
        SET "status" = 'OUT_FOR_DELIVERY'::"TransferStatus", "outForDeliveryAt" = now(), "updatedAt" = now()
        WHERE "id" = ${id} AND "status" = 'PICKING'::"TransferStatus"
        RETURNING "id"
      `;
      if (claimed.length === 0) {
        throw new ConflictException(`Cannot dispatch a transfer in status ${transfer.status}`);
      }

      // Delivery Challan number is assigned here, once, the moment dispatch
      // actually happens — this is the first point the challan represents
      // something real (goods leaving the warehouse). Safe to call after the
      // claim above: only the caller that won the race reaches this line, so
      // a concurrent duplicate dispatch() can never burn two DC numbers on
      // one transfer.
      const dcNumber = await this.codes.next('DC', tx);
      await tx.transfer.update({ where: { id }, data: { dcNumber } });

      const warehouse = await tx.location.findFirst({ where: { type: 'WAREHOUSE' } });
      if (!warehouse) throw new ConflictException('No central warehouse location is configured');

      for (const item of transfer.items) {
        await this.inventory.releaseReservation(tx, warehouse.id, item.productId, item.approvedQty);
        if (item.pickedQty! > 0) {
          await this.inventory.applyMovement(tx, {
            locationId: warehouse.id,
            productId: item.productId,
            quantity: -item.pickedQty!,
            type: MovementType.TRANSFER_OUT,
            reference: transfer.code,
            userId: user.userId,
          });
        }
      }

      const updated = await tx.transfer.findUniqueOrThrow({ where: { id } });
      return { ...updated, branchName: transfer.branch.name };
    });

    await this.activity.log(`${result.dcNumber} is out for delivery to ${result.branchName}`, 'delivery', user.userId);
    return result;
  }

  /**
   * Driver's "Mark Delivered." Credits the branch with what was actually
   * delivered (defaults to pickedQty; a driver can report less if something
   * didn't make it, e.g. breakage) — never the originally approved amount.
   * Same atomic-claim pattern as dispatch(): the OUT_FOR_DELIVERY ->
   * DELIVERED/PARTIALLY_DELIVERED transition is a single conditional
   * UPDATE inside the transaction, so a concurrent duplicate call cannot
   * also credit the branch a second time for one delivery.
   */
  async markDelivered(id: string, items: DeliveredItemDto[] | undefined, user: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUnique({ where: { id }, include: { items: true, branch: true } });
      if (!transfer) throw new NotFoundException('Transfer not found');
      await this.assertAccess(user, transfer);
      if (transfer.status !== TransferStatus.OUT_FOR_DELIVERY) {
        throw new ConflictException(`Cannot mark delivered a transfer in status ${transfer.status}`);
      }

      const overrides = new Map((items ?? []).map((i) => [i.productId, i.deliveredQty]));
      let anyShort = false;
      const resolved: { productId: string; delivered: number }[] = [];
      for (const item of transfer.items) {
        const picked = item.pickedQty ?? 0;
        const delivered = overrides.get(item.productId) ?? picked;
        if (delivered > picked) {
          throw new ConflictException(`Delivered quantity for ${item.productId} cannot exceed picked quantity (${picked})`);
        }
        if (delivered < picked) anyShort = true;
        resolved.push({ productId: item.productId, delivered });
      }
      const finalStatus = anyShort ? TransferStatus.PARTIALLY_DELIVERED : TransferStatus.DELIVERED;

      // Atomic claim — see dispatch() above for why this has to be a single
      // conditional UPDATE rather than a JS-level status check.
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Transfer"
        SET "status" = ${finalStatus}::"TransferStatus", "deliveredAt" = now(), "updatedAt" = now()
        WHERE "id" = ${id} AND "status" = 'OUT_FOR_DELIVERY'::"TransferStatus"
        RETURNING "id"
      `;
      if (claimed.length === 0) {
        throw new ConflictException(`Cannot mark delivered a transfer in status ${transfer.status}`);
      }

      for (const { productId, delivered } of resolved) {
        if (delivered > 0) {
          await this.inventory.applyMovement(tx, {
            locationId: transfer.branchId,
            productId,
            quantity: delivered,
            type: MovementType.TRANSFER_IN,
            reference: transfer.code,
            userId: user.userId,
          });
        }
        await tx.transferItem.update({
          where: { transferId_productId: { transferId: id, productId } },
          data: { deliveredQty: delivered },
        });
      }

      await tx.stockRequest.update({
        where: { id: transfer.requestId },
        data: { status: finalStatus === TransferStatus.DELIVERED ? RequestStatus.DELIVERED : RequestStatus.PARTIALLY_DELIVERED },
      });

      const updated = await tx.transfer.findUniqueOrThrow({ where: { id } });
      return { ...updated, branchName: transfer.branch.name };
    });

    await this.activity.log(`${result.branchName} inventory updated from ${result.dcNumber}`, 'inventory', user.userId);
    await this.activity.log(`${result.dcNumber} delivered to ${result.branchName}${result.status === TransferStatus.PARTIALLY_DELIVERED ? ' (partial)' : ''}`, 'delivery', user.userId);
    return result;
  }

  /**
   * Branch acknowledgment — inventory already moved at markDelivered(); this
   * just closes the loop and records who signed off. No status transition
   * (DELIVERED/PARTIALLY_DELIVERED stays as-is) and no inventory effect, so
   * a duplicate call is harmless — it just overwrites confirmedAt/By with a
   * near-identical value. Not worth an atomic guard.
   */
  async confirmReceipt(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id } });
    await this.assertAccess(user, transfer);
    if (user.role !== Role.BRANCH_USER) {
      throw new ForbiddenException('Only the receiving branch confirms receipt');
    }
    if (transfer.status !== TransferStatus.DELIVERED && transfer.status !== TransferStatus.PARTIALLY_DELIVERED) {
      throw new ConflictException(`Cannot confirm receipt for a transfer in status ${transfer.status}`);
    }
    const updated = await this.prisma.transfer.update({
      where: { id },
      data: { confirmedAt: new Date(), confirmedById: user.userId },
    });
    await this.activity.log(`${updated.dcNumber} receipt confirmed by branch`, 'delivery', user.userId);
    return updated;
  }

  /**
   * No inventory effect either way (goods already moved at dispatch time if
   * this fails post-dispatch, or the reservation is simply abandoned if it
   * fails earlier — fail() itself doesn't touch InventoryItem). A race
   * between two fail() calls converges on the same FAILED status regardless
   * of which "reason" text wins — no corruption possible, no guard needed.
   */
  async fail(id: string, reason: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id } });
    await this.assertAccess(user, transfer);
    if (!IN_FLIGHT_FAILABLE.includes(transfer.status)) {
      throw new ConflictException(`Cannot fail a transfer in status ${transfer.status}`);
    }
    const updated = await this.prisma.transfer.update({
      where: { id },
      data: { status: TransferStatus.FAILED, failedReason: reason, failedAt: new Date() },
      include: { request: { select: { ocNumber: true } } },
    });
    await this.activity.log(`${this.docLabel(updated)} delivery failed: ${reason}`, 'delivery', user.userId);
    return updated;
  }

  /**
   * Retry/reassignment. Goods already picked (onHand was already decremented
   * at dispatch time) stay "with the transfer" physically — no new movement
   * is created here, this only resumes the workflow, optionally onto a
   * different driver. Same reasoning as fail(): both possible races
   * converge on the same end state, no inventory touched, no guard needed.
   */
  async retry(id: string, driverId: string | undefined, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id } });
    if (transfer.status !== TransferStatus.FAILED) {
      throw new ConflictException(`Cannot retry a transfer in status ${transfer.status}`);
    }
    if (driverId) {
      const driver = await this.prisma.user.findUnique({ where: { id: driverId } });
      if (!driver || driver.role !== Role.DRIVER || !driver.active) {
        throw new ConflictException('driverId must reference an active driver');
      }
    }
    const updated = await this.prisma.transfer.update({
      where: { id },
      data: { status: TransferStatus.OUT_FOR_DELIVERY, failedReason: null, failedAt: null, ...(driverId && { driverId }) },
      include: { request: { select: { ocNumber: true } } },
    });
    await this.activity.log(`${this.docLabel(updated)} retried${driverId ? ' with a reassigned driver' : ''}`, 'delivery', user.userId);
    return updated;
  }

  /** No status precondition to guard — an ETA can be set/changed regardless of transfer status. */
  async setEta(id: string, eta: { etaDate?: string; etaWindowStart?: string; etaWindowEnd?: string }, user: AuthUser) {
    if (user.role !== Role.WAREHOUSE_MANAGER && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only the warehouse manager sets delivery ETAs');
    }
    return this.prisma.transfer.update({
      where: { id },
      data: {
        etaDate: eta.etaDate ? new Date(eta.etaDate) : undefined,
        etaWindowStart: eta.etaWindowStart,
        etaWindowEnd: eta.etaWindowEnd,
      },
    });
  }
}
