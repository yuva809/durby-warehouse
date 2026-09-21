import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CodesService } from '../common/codes.service';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { CreateRequestDto } from './dto/request.dto';

const REVIEWABLE: RequestStatus[] = [RequestStatus.PENDING, RequestStatus.REVIEWING];

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private codes: CodesService,
    private activity: ActivityService,
  ) {}

  private async assertBranchAccess(user: AuthUser, branchId: string) {
    if (user.role === 'BRANCH_USER' && user.locationId !== branchId) {
      throw new ForbiddenException("You don't have access to this branch");
    }
  }

  private async getWarehouse() {
    const warehouse = await this.prisma.location.findFirst({ where: { type: LocationType.WAREHOUSE } });
    if (!warehouse) throw new ConflictException('No central warehouse location is configured');
    return warehouse;
  }

  async list(user: AuthUser, status?: RequestStatus) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (user.role === 'BRANCH_USER') {
      if (!user.locationId) return [];
      where.branchId = user.locationId;
    }
    // DRIVER has no legitimate reason to list requests — they work off Transfers.
    if (user.role === 'DRIVER') return [];

    return this.prisma.stockRequest.findMany({
      where,
      include: { items: { include: { product: true } }, branch: true, transfer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string, user: AuthUser) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, branch: true, transfer: { include: { items: true } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    await this.assertBranchAccess(user, request.branchId);
    return request;
  }

  async create(user: AuthUser, dto: CreateRequestDto) {
    if (user.role !== 'BRANCH_USER' || !user.locationId) {
      throw new ForbiddenException('Only a branch user may create a stock request');
    }

    const code = await this.codes.next('REQ');
    const request = await this.prisma.stockRequest.create({
      data: {
        code,
        branchId: user.locationId,
        createdById: user.userId,
        status: RequestStatus.PENDING,
        items: {
          create: dto.items.map((i) => ({ productId: i.productId, requestedQty: i.requestedQty })),
        },
      },
      include: { items: true, branch: true },
    });

    await this.activity.log(`${request.branch.name} submitted ${code} (${dto.items.length} product${dto.items.length === 1 ? '' : 's'})`, 'request', user.userId);
    return request;
  }

  async markReviewing(id: string, user: AuthUser) {
    const request = await this.prisma.stockRequest.findUniqueOrThrow({ where: { id } });
    if (request.status !== RequestStatus.PENDING) return request;
    return this.prisma.stockRequest.update({ where: { id }, data: { status: RequestStatus.REVIEWING } });
  }

  async updateApprovedQty(id: string, productId: string, approvedQty: number, user: AuthUser) {
    const request = await this.prisma.stockRequest.findUniqueOrThrow({ where: { id } });
    if (!REVIEWABLE.includes(request.status)) {
      throw new ConflictException(`Cannot modify a request in status ${request.status}`);
    }
    if (approvedQty < 0) throw new ConflictException('approvedQty cannot be negative');

    await this.prisma.stockRequestItem.update({
      where: { requestId_productId: { requestId: id, productId } },
      data: { approvedQty },
    });
    await this.activity.log(`Quantity adjusted for ${request.code}: approved ${approvedQty}`, 'review', user.userId);
    return this.get(id, user);
  }

  /**
   * The critical transaction. Reserves stock for every line item in ONE
   * database transaction: if any line's available stock can't cover its
   * approved quantity, InventoryService.reserve throws and the whole
   * transaction — including any lines already reserved earlier in this
   * same loop — rolls back. Nothing is approved "partially" by accident.
   */
  async approve(id: string, user: AuthUser) {
    if (user.role !== 'WAREHOUSE_MANAGER' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only the warehouse manager may approve requests');
    }

    const warehouse = await this.getWarehouse();

    const transfer = await this.prisma.$transaction(async (tx) => {
      const request = await tx.stockRequest.findUniqueOrThrow({
        where: { id },
        include: { items: true, branch: true },
      });
      if (!REVIEWABLE.includes(request.status)) {
        throw new ConflictException(`Cannot approve a request in status ${request.status}`);
      }

      const resolved = request.items.map((it) => ({
        productId: it.productId,
        approvedQty: it.approvedQty ?? it.requestedQty,
      }));

      for (const item of resolved) {
        if (item.approvedQty > 0) {
          await this.inventory.reserve(tx, warehouse.id, item.productId, item.approvedQty);
        }
      }

      const code = await this.codes.next('TR', tx);
      const createdTransfer = await tx.transfer.create({
        data: {
          code,
          requestId: id,
          branchId: request.branchId,
          status: 'READY',
          items: { create: resolved.map((it) => ({ productId: it.productId, approvedQty: it.approvedQty })) },
        },
        include: { items: true },
      });

      for (const item of resolved) {
        await tx.stockRequestItem.update({
          where: { requestId_productId: { requestId: id, productId: item.productId } },
          data: { approvedQty: item.approvedQty },
        });
      }

      await tx.stockRequest.update({
        where: { id },
        data: { status: RequestStatus.APPROVED, reviewedById: user.userId, reviewedAt: new Date() },
      });

      return { ...createdTransfer, requestCode: request.code, branchName: request.branch.name };
    });

    await this.activity.log(`Transfer ${transfer.code} created for ${transfer.branchName}`, 'transfer', user.userId);
    await this.activity.log(`Warehouse Manager approved ${transfer.requestCode}`, 'review', user.userId);

    return transfer;
  }

  async reject(id: string, reason: string, user: AuthUser) {
    if (user.role !== 'WAREHOUSE_MANAGER' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only the warehouse manager may reject requests');
    }
    const request = await this.prisma.stockRequest.findUniqueOrThrow({ where: { id } });
    if (!REVIEWABLE.includes(request.status)) {
      throw new ConflictException(`Cannot reject a request in status ${request.status}`);
    }
    const updated = await this.prisma.stockRequest.update({
      where: { id },
      data: { status: RequestStatus.REJECTED, rejectionReason: reason, reviewedById: user.userId, reviewedAt: new Date() },
    });
    await this.activity.log(`Warehouse Manager rejected ${updated.code}`, 'review', user.userId);
    return updated;
  }

  async cancel(id: string, user: AuthUser) {
    const request = await this.prisma.stockRequest.findUniqueOrThrow({ where: { id } });
    // Any user belonging to the branch may cancel, not just the original creator.
    await this.assertBranchAccess(user, request.branchId);
    if (!REVIEWABLE.includes(request.status)) {
      throw new ConflictException(
        `Cannot cancel a request in status ${request.status} — it has already been decided. Nothing was reserved yet, so there is nothing to release.`,
      );
    }
    const updated = await this.prisma.stockRequest.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED, cancelledAt: new Date() },
    });
    await this.activity.log(`${updated.code} cancelled by the branch`, 'review', user.userId);
    return updated;
  }
}
