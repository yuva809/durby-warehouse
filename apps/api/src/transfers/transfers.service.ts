import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestStatus, Role, TransferStatus, MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { DeliveredItemDto, SetPickedQtyDto } from './dto/transfer.dto';

const IN_FLIGHT_FAILABLE: TransferStatus[] = [TransferStatus.ASSIGNED, TransferStatus.PICKING, TransferStatus.OUT_FOR_DELIVERY];

@Injectable()
export class TransfersService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private activity: ActivityService,
  ) {}

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

  async assignDriver(id: string, driverId: string, user: AuthUser) {
    const driver = await this.prisma.user.findUnique({ where: { id: driverId } });
    if (!driver || driver.role !== Role.DRIVER || !driver.active) {
      throw new ConflictException('driverId must reference an active driver');
    }
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id } });
    if (transfer.status !== TransferStatus.READY && transfer.status !== TransferStatus.ASSIGNED) {
      throw new ConflictException(`Cannot assign a driver to a transfer in status ${transfer.status}`);
    }
    const updated = await this.prisma.transfer.update({
      where: { id },
      data: { driverId, status: TransferStatus.ASSIGNED },
    });
    await this.activity.log(`Driver ${driver.name} assigned to ${updated.code}`, 'transfer', user.userId);
    return updated;
  }

  async startPicking(id: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id } });
    await this.assertAccess(user, transfer);
    if (transfer.status !== TransferStatus.ASSIGNED) {
      throw new ConflictException(`Cannot start picking a transfer in status ${transfer.status}`);
    }
    const updated = await this.prisma.transfer.update({ where: { id }, data: { status: TransferStatus.PICKING } });
    await this.activity.log(`Driver started picking for ${updated.code}`, 'delivery', user.userId);
    return updated;
  }

  /** Draft-only: records what the driver counted so far. No inventory effect until dispatch(). */
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
    return this.prisma.transferItem.update({
      where: { transferId_productId: { transferId: id, productId: dto.productId } },
      data: { pickedQty: dto.pickedQty },
    });
  }

  /**
   * "Start Delivery." The one transaction that turns a reservation into a
   * real stock movement: validates state, validates every picked quantity
   * is set and within bounds, releases the approved-qty reservation,
   * removes the actual picked quantity from warehouse onHand (with a
   * ledger row per item), and flips the transfer to OUT_FOR_DELIVERY.
   * pickedQty — not approvedQty — is what leaves the building.
   */
  async dispatch(id: string, user: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUniqueOrThrow({ where: { id }, include: { items: true, branch: true } });
      await this.assertAccess(user, transfer);
      if (transfer.status !== TransferStatus.PICKING) {
        throw new ConflictException(`Cannot dispatch a transfer in status ${transfer.status}`);
      }

      const warehouse = await tx.location.findFirst({ where: { type: 'WAREHOUSE' } });
      if (!warehouse) throw new ConflictException('No central warehouse location is configured');

      for (const item of transfer.items) {
        if (item.pickedQty === null) {
          throw new ConflictException(`Picked quantity has not been recorded for product ${item.productId}`);
        }
        await this.inventory.releaseReservation(tx, warehouse.id, item.productId, item.approvedQty);
        if (item.pickedQty > 0) {
          await this.inventory.applyMovement(tx, {
            locationId: warehouse.id,
            productId: item.productId,
            quantity: -item.pickedQty,
            type: MovementType.TRANSFER_OUT,
            reference: transfer.code,
            userId: user.userId,
          });
        }
      }

      const updated = await tx.transfer.update({
        where: { id },
        data: { status: TransferStatus.OUT_FOR_DELIVERY, outForDeliveryAt: new Date() },
      });
      return { ...updated, branchName: transfer.branch.name };
    });

    await this.activity.log(`${result.code} is out for delivery to ${result.branchName}`, 'delivery', user.userId);
    return result;
  }

  /**
   * Driver's "Mark Delivered." Credits the branch with what was actually
   * delivered (defaults to pickedQty; a driver can report less if something
   * didn't make it, e.g. breakage) — never the originally approved amount.
   * Sets the transfer (and mirrors onto the request) to DELIVERED if every
   * item arrived in full, or PARTIALLY_DELIVERED otherwise.
   */
  async markDelivered(id: string, items: DeliveredItemDto[] | undefined, user: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.findUniqueOrThrow({ where: { id }, include: { items: true, branch: true } });
      await this.assertAccess(user, transfer);
      if (transfer.status !== TransferStatus.OUT_FOR_DELIVERY) {
        throw new ConflictException(`Cannot mark delivered a transfer in status ${transfer.status}`);
      }

      const overrides = new Map((items ?? []).map((i) => [i.productId, i.deliveredQty]));
      let anyShort = false;

      for (const item of transfer.items) {
        const picked = item.pickedQty ?? 0;
        const delivered = overrides.get(item.productId) ?? picked;
        if (delivered > picked) {
          throw new ConflictException(`Delivered quantity for ${item.productId} cannot exceed picked quantity (${picked})`);
        }
        if (delivered < picked) anyShort = true;

        if (delivered > 0) {
          await this.inventory.applyMovement(tx, {
            locationId: transfer.branchId,
            productId: item.productId,
            quantity: delivered,
            type: MovementType.TRANSFER_IN,
            reference: transfer.code,
            userId: user.userId,
          });
        }
        await tx.transferItem.update({
          where: { transferId_productId: { transferId: id, productId: item.productId } },
          data: { deliveredQty: delivered },
        });
      }

      const finalStatus = anyShort ? TransferStatus.PARTIALLY_DELIVERED : TransferStatus.DELIVERED;
      const updated = await tx.transfer.update({
        where: { id },
        data: { status: finalStatus, deliveredAt: new Date() },
      });
      await tx.stockRequest.update({
        where: { id: transfer.requestId },
        data: { status: finalStatus === TransferStatus.DELIVERED ? RequestStatus.DELIVERED : RequestStatus.PARTIALLY_DELIVERED },
      });

      return { ...updated, branchName: transfer.branch.name };
    });

    await this.activity.log(`${result.branchName} inventory updated from ${result.code}`, 'inventory', user.userId);
    await this.activity.log(`${result.code} delivered to ${result.branchName}${result.status === TransferStatus.PARTIALLY_DELIVERED ? ' (partial)' : ''}`, 'delivery', user.userId);
    return result;
  }

  /** Branch acknowledgment — inventory already moved at markDelivered(); this just closes the loop and records who signed off. */
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
    await this.activity.log(`${updated.code} receipt confirmed by branch`, 'delivery', user.userId);
    return updated;
  }

  async fail(id: string, reason: string, user: AuthUser) {
    const transfer = await this.prisma.transfer.findUniqueOrThrow({ where: { id } });
    await this.assertAccess(user, transfer);
    if (!IN_FLIGHT_FAILABLE.includes(transfer.status)) {
      throw new ConflictException(`Cannot fail a transfer in status ${transfer.status}`);
    }
    const updated = await this.prisma.transfer.update({
      where: { id },
      data: { status: TransferStatus.FAILED, failedReason: reason, failedAt: new Date() },
    });
    await this.activity.log(`${updated.code} delivery failed: ${reason}`, 'delivery', user.userId);
    return updated;
  }

  /**
   * Retry/reassignment. Goods already picked (onHand was already decremented
   * at dispatch time) stay "with the transfer" physically — no new movement
   * is created here, this only resumes the workflow, optionally onto a
   * different driver.
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
    });
    await this.activity.log(`${updated.code} retried${driverId ? ' with a reassigned driver' : ''}`, 'delivery', user.userId);
    return updated;
  }

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
