import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, RequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CodesService } from '../common/codes.service';
import { findWarehouse } from '../common/warehouse';
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

  /**
   * Branch scoping (own branch only) AND driver exclusion — a driver works
   * off Transfers, never StockRequests directly (list() below already
   * returns [] for them; this is the same rule applied to direct-by-id
   * access, matching how transfers.service.ts's assertAccess treats both
   * roles explicitly rather than only checking one of them).
   */
  private async assertBranchAccess(user: AuthUser, branchId: string) {
    if (user.role === 'BRANCH_USER' && user.locationId !== branchId) {
      throw new ForbiddenException("You don't have access to this branch");
    }
    if (user.role === 'DRIVER') {
      throw new ForbiddenException('Drivers do not have access to stock requests');
    }
  }

  private async getWarehouse() {
    const warehouse = await findWarehouse(this.prisma);
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
      include: {
        items: { include: { product: true } },
        branch: true,
        createdBy: { select: { name: true } },
        transfer: { include: { items: true } },
      },
    });
    if (!request) throw new NotFoundException('Request not found');
    await this.assertBranchAccess(user, request.branchId);
    return request;
  }

  async create(user: AuthUser, dto: CreateRequestDto) {
    if (user.role !== 'BRANCH_USER' || !user.locationId) {
      throw new ForbiddenException('Only a branch user may create a stock request');
    }

    // Validate the products BEFORE anything is created: an unknown id must be a clear 4xx, never a foreign-key 500.
    const ids = dto.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each product can appear only once in a request.');
    const known = await this.prisma.product.count({ where: { id: { in: ids }, active: true } });
    if (known !== ids.length) throw new BadRequestException('One or more of the requested products do not exist or are no longer available.');

    const code = await this.codes.next('REQ');
    const ocNumber = await this.codes.next('OC');
    const request = await this.prisma.stockRequest.create({
      data: {
        code,
        ocNumber,
        branchId: user.locationId,
        createdById: user.userId,
        status: RequestStatus.PENDING,
        items: {
          create: dto.items.map((i) => ({ productId: i.productId, requestedQty: i.requestedQty })),
        },
      },
      include: { items: true, branch: true },
    });

    await this.activity.log(`${request.branch.name} submitted ${ocNumber} (${dto.items.length} product${dto.items.length === 1 ? '' : 's'})`, 'request', user.userId);
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
    // The limits are enforced HERE, on the server (the UI only mirrors them): a whole number, from 0 up to what the branch asked for.
    const line = await this.prisma.stockRequestItem.findUnique({
      where: { requestId_productId: { requestId: id, productId } },
      include: { product: { select: { name: true } } },
    });
    if (!line) throw new NotFoundException('That product is not on this request');
    if (!Number.isInteger(approvedQty) || approvedQty < 0) throw new BadRequestException('The approved quantity must be a whole number, 0 or more.');
    if (approvedQty > line.requestedQty) {
      throw new BadRequestException(`The approved quantity (${approvedQty}) cannot exceed the requested quantity (${line.requestedQty}) for ${line.product.name}.`);
    }

    await this.prisma.stockRequestItem.update({
      where: { requestId_productId: { requestId: id, productId } },
      data: { approvedQty },
    });
    await this.activity.log(`Quantity adjusted for ${request.ocNumber}: approved ${approvedQty}`, 'review', user.userId);
    return this.get(id, user);
  }

  /**
   * The critical transaction. The PENDING/REVIEWING -> APPROVED transition
   * is claimed with a single conditional UPDATE ("WHERE status IN
   * (PENDING, REVIEWING)") *before* anything else happens — not the
   * Transfer.requestId unique constraint, which used to be the only thing
   * standing between two concurrent approvals and a double reservation (it
   * would have rolled the loser back, but only after it had already
   * reserved stock and only by accident of an unrelated schema constraint,
   * surfacing as a raw unhandled 500 instead of a clean 409). Now: whoever
   * loses the race gets zero rows back from the claim and a ConflictException
   * immediately, before reserve() is ever called — so a losing request never
   * touches inventory at all. Reservation and transfer creation only happen
   * after the claim succeeds, and the whole thing is still one transaction.
   */
  async approve(id: string, user: AuthUser) {
    if (user.role !== 'WAREHOUSE_MANAGER' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only the warehouse manager may approve requests');
    }

    const warehouse = await this.getWarehouse();

    const transfer = await this.prisma.$transaction(async (tx) => {
      const request = await tx.stockRequest.findUnique({
        where: { id },
        include: { items: true, branch: true },
      });
      if (!request) throw new NotFoundException('Request not found');
      if (!REVIEWABLE.includes(request.status)) {
        throw new ConflictException(`Cannot approve a request in status ${request.status}`);
      }

      // Defence in depth: whatever got stored, nothing above the requested quantity (or negative / fractional) may ever be reserved.
      for (const it of request.items) {
        const approved = it.approvedQty ?? it.requestedQty;
        if (!Number.isInteger(approved) || approved < 0 || approved > it.requestedQty) {
          throw new ConflictException('An approved quantity is outside the requested quantity. Correct it before approving.');
        }
      }

      // Atomic claim — the actual concurrency guard, evaluated before any
      // stock is touched.
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "StockRequest"
        SET "status" = 'APPROVED'::"RequestStatus", "reviewedById" = ${user.userId}, "reviewedAt" = now(), "updatedAt" = now()
        WHERE "id" = ${id} AND "status" IN ('PENDING', 'REVIEWING')
        RETURNING "id"
      `;
      if (claimed.length === 0) {
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

      return { ...createdTransfer, requestOcNumber: request.ocNumber, branchName: request.branch.name };
    });

    // No dcNumber yet — it's only assigned at dispatch() — so the delivery
    // is referenced by the order it belongs to, never by the internal TR-
    // code, matching the "OC = order, DC = delivery" customer-facing rule.
    await this.activity.log(`Transfer created for ${transfer.branchName} (Order ${transfer.requestOcNumber})`, 'transfer', user.userId);
    await this.activity.log(`Warehouse Manager approved ${transfer.requestOcNumber}`, 'review', user.userId);

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
    await this.activity.log(`Warehouse Manager rejected ${updated.ocNumber}`, 'review', user.userId);
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
    await this.activity.log(`${updated.ocNumber} cancelled by the branch`, 'review', user.userId);
    return updated;
  }
}
