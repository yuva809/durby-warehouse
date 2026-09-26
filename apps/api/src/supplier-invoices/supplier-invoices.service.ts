import { ConflictException, HttpException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SupplierInvoiceStatus, MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CodesService } from '../common/codes.service';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CsvInvoiceParser } from './parsers/csv.parser';
import { ExcelInvoiceParser } from './parsers/excel.parser';
import { PdfInvoiceParser } from './parsers/pdf.parser';
import type { SupplierInvoiceParser } from './parsers/types';
import { MAX_INVOICE_QTY } from './parsers/quantity';
import { ImportMatchingService } from './matching.service';
import { ProductImageQueueService } from '../product-images/product-image-queue.service';
import { displayImageUrl } from '../product-images/image-url.util';
import type { UploadSupplierInvoiceDto } from './dto/supplier-invoice.dto';

const OPEN_STATUSES: SupplierInvoiceStatus[] = [SupplierInvoiceStatus.DRAFT, SupplierInvoiceStatus.UNDER_REVIEW];

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Injectable()
export class SupplierInvoicesService {
  private readonly logger = new Logger(SupplierInvoicesService.name);
  private parsers: SupplierInvoiceParser[];

  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private codes: CodesService,
    private activity: ActivityService,
    private matching: ImportMatchingService,
    private productImages: ProductImageQueueService,
    csv: CsvInvoiceParser,
    excel: ExcelInvoiceParser,
    pdf: PdfInvoiceParser,
  ) {
    this.parsers = [csv, excel, pdf];
  }

  // sourceFileData is only ever meant to leave the server via getSourceFile()
  // below (the raw download endpoint) — omitted everywhere else so a normal
  // list/detail response doesn't ship the whole file's bytes as JSON.
  list() {
    return this.prisma.supplierInvoice.findMany({
      omit: { sourceFileData: true },
      include: { uploadedBy: { select: { name: true } }, confirmedBy: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const invoice = await this.prisma.supplierInvoice.findUnique({
      where: { id },
      omit: { sourceFileData: true },
      include: {
        uploadedBy: { select: { name: true } },
        confirmedBy: { select: { name: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                image: { select: { status: true, imageUrl: true, confidence: true } },
              },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    return {
      ...invoice,
      items: invoice.items.map((item) => ({
        ...item,
        product: item.product && {
          ...item.product,
          // Manual uploads store bytes, not a URL, and an unreviewed
          // FOUND_NEEDS_REVIEW candidate gets no displayable URL — see
          // displayImageUrl. status/confidence still flow through so the
          // review screen can flag the line as pending.
          image: item.product.image && {
            ...item.product.image,
            imageUrl: displayImageUrl(item.product.id, item.product.image),
          },
        },
      })),
    };
  }

  /**
   * Parses the uploaded file and stages it for review. Nothing here ever
   * touches InventoryItem/InventoryMovement — parsing and matching are pure
   * reads. Every row is run through ImportMatchingService so the manager
   * lands on a review screen that's already mostly resolved, with
   * low-confidence/unmatched rows clearly flagged rather than silently
   * guessed at.
   */
  async upload(file: UploadedFile, dto: UploadSupplierInvoiceDto, user: AuthUser) {
    const parser = this.parsers.find((p) => p.supports(file.mimetype, file.originalname));
    if (!parser) {
      throw new ConflictException(`Unsupported file type "${file.mimetype || file.originalname}". Supported: CSV, XLSX, XLSM, PDF.`);
    }

    let parsed;
    try {
      parsed = await parser.parse(file.buffer);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // A corrupt / password-protected PDF, a malformed spreadsheet, etc. The full error goes to the server log; the manager
      // gets a clear, safe message and can fix the file or re-export it, instead of a bare "Internal server error".
      this.logger.error(`Could not parse "${file.originalname}" (${file.mimetype}): ${(err as Error).stack ?? err}`);
      const reason = String((err as Error).message ?? '').split('\n')[0].slice(0, 160);
      throw new UnprocessableEntityException(`This file could not be read${reason ? ` (${reason})` : ''}. Check that it is a valid, unprotected PDF, CSV or Excel file, or re-export it.`);
    }
    if (parsed.rows.length === 0) {
      throw new ConflictException(
        `No product rows could be read from this file.${parsed.warnings.length ? ' ' + parsed.warnings.join(' ') : ''}`,
      );
    }

    // Last line of defence before the database: the parsers already refuse implausible quantities (see parsers/quantity.ts),
    // but a row that reached this point with a quantity the column cannot hold must be a clear 422 naming the row, never a 500.
    const unusable = parsed.rows.filter((r) => !Number.isInteger(r.quantity) || r.quantity < 1 || r.quantity > MAX_INVOICE_QTY);
    if (unusable.length > 0) {
      throw new UnprocessableEntityException(
        `Some lines have a quantity that cannot be stored: ${unusable.slice(0, 3).map((r) => `"${r.rawDescription.slice(0, 40)}" (${r.quantity})`).join(', ')}. Quantities must be whole numbers from 1 to ${MAX_INVOICE_QTY.toLocaleString('en-US')}.`,
      );
    }

    // Duplicate-row detection: same code (or same normalized description
    // when no code) appearing twice in one upload — flagged, not merged or
    // dropped, so the manager decides (could be two genuinely separate
    // lines, e.g. different batches).
    const seen = new Map<string, number>();
    for (const row of parsed.rows) {
      const key = (row.rawProductCode || row.rawDescription).trim().toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    const code = await this.codes.next('INV');
    const matchedProductIds = new Set<string>();
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplierInvoice.create({
        data: {
          code,
          supplierName: dto.supplierName,
          invoiceNumber: dto.invoiceNumber,
          invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
          status: SupplierInvoiceStatus.UNDER_REVIEW,
          sourceFileName: file.originalname,
          sourceFileType: file.mimetype,
          sourceFileData: new Uint8Array(file.buffer),
          uploadedById: user.userId,
        },
      });

      for (const row of parsed.rows) {
        const match = await this.matching.matchProduct(row.rawDescription, row.rawProductCode);
        const key = (row.rawProductCode || row.rawDescription).trim().toLowerCase();
        const isDuplicate = (seen.get(key) ?? 0) > 1;
        if (match.productId) matchedProductIds.add(match.productId);
        await tx.supplierInvoiceItem.create({
          data: {
            invoiceId: created.id,
            productId: match.productId,
            rawDescription: row.rawDescription,
            rawProductCode: row.rawProductCode,
            unit: row.unit,
            invoiceQty: row.quantity,
            // Pre-fill received = invoice qty as a starting point the
            // manager edits — never written to inventory until confirm().
            receivedQty: row.quantity,
            matchConfidence: match.confidence,
            needsReview: match.confidence !== 'exact' || isDuplicate || !!parsed.forceReview,
          },
        });
      }

      return created;
    });

    await this.activity.log(`${dto.supplierName} invoice ${code} uploaded for review (${parsed.rows.length} line${parsed.rows.length === 1 ? '' : 's'})`, 'inventory', user.userId);

    // Best-effort background catalog enrichment — see ProductImageQueueService
    // and product-images/product-images.service.ts. Deliberately AFTER the
    // transaction commits and completely decoupled from it: a slow/failed
    // image lookup can never affect whether the invoice itself was created.
    for (const productId of matchedProductIds) {
      await this.productImages.enqueueLookup(productId);
    }

    // `warnings` (lines that were skipped and why, OCR notices) are returned with the upload so the review screen can show them.
    return { ...(await this.get(invoice.id)), warnings: parsed.warnings };
  }

  async updateItem(invoiceId: string, itemId: string, patch: { productId?: string | null; receivedQty?: number }) {
    const invoice = await this.prisma.supplierInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (!OPEN_STATUSES.includes(invoice.status)) {
      throw new ConflictException(`Cannot edit an invoice in status ${invoice.status}`);
    }
    const item = await this.prisma.supplierInvoiceItem.findUniqueOrThrow({ where: { id: itemId } });
    if (item.invoiceId !== invoiceId) throw new NotFoundException('That item does not belong to this invoice');

    const updated = await this.prisma.supplierInvoiceItem.update({
      where: { id: itemId },
      data: {
        ...(patch.productId !== undefined && { productId: patch.productId, needsReview: false, matchConfidence: patch.productId ? 'exact' : 'unmatched' }),
        ...(patch.receivedQty !== undefined && { receivedQty: patch.receivedQty }),
      },
    });
    if (patch.productId) {
      await this.productImages.enqueueLookup(patch.productId);
    }
    return updated;
  }

  /**
   * The only place stock is ever added from a supplier invoice. Same atomic
   * claim pattern as approve()/dispatch()/markDelivered(): the
   * DRAFT/UNDER_REVIEW -> CONFIRMED transition is one conditional UPDATE
   * inside the transaction, evaluated before any inventory is touched, so a
   * duplicate confirm click (double submit, retry) can affect at most one of
   * the two calls — the loser gets a 409 and never reaches applyMovement.
   * onHand only, via InventoryService.applyMovement — reserved is never
   * touched here, exactly like every other receipt-type movement.
   */
  async confirm(id: string, user: AuthUser) {
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.findUnique({ where: { id }, include: { items: true } });
      if (!invoice) throw new NotFoundException('Supplier invoice not found');
      if (!OPEN_STATUSES.includes(invoice.status)) {
        throw new ConflictException(`This invoice is already ${invoice.status.toLowerCase().replace('_', ' ')} — nothing to confirm.`);
      }
      if (invoice.items.length === 0) {
        throw new ConflictException('This invoice has no line items');
      }
      for (const item of invoice.items) {
        if (!item.productId) {
          throw new ConflictException(`"${item.rawDescription}" has not been matched to a product yet — resolve it before confirming.`);
        }
        // needsReview is a real gate, not just a UI badge: a fuzzy match, a
        // duplicate-row flag, or any PDF-sourced row (best-effort text
        // extraction, never auto-trusted) must be explicitly resolved by the
        // manager — via updateItem(), which clears the flag — before it can
        // add stock. This is what makes "⚠ Needs Review" a real safeguard
        // instead of decoration a manager could click past.
        if (item.needsReview) {
          throw new ConflictException(`"${item.rawDescription}" needs review — confirm the matched product before confirming this invoice.`);
        }
        if (item.receivedQty === null || item.receivedQty === undefined) {
          throw new ConflictException(`Received quantity is not set for "${item.rawDescription}".`);
        }
        if (item.receivedQty < 0) {
          throw new ConflictException(`Received quantity cannot be negative for "${item.rawDescription}".`);
        }
      }

      // Atomic claim — the actual concurrency guard.
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "SupplierInvoice"
        SET "status" = 'CONFIRMED'::"SupplierInvoiceStatus", "confirmedById" = ${user.userId}, "confirmedAt" = now(), "updatedAt" = now()
        WHERE "id" = ${id} AND "status" IN ('DRAFT', 'UNDER_REVIEW')
        RETURNING "id"
      `;
      if (claimed.length === 0) {
        throw new ConflictException('This invoice has already been confirmed or cancelled — inventory was not changed again.');
      }

      const warehouse = await tx.location.findFirst({ where: { type: 'WAREHOUSE' } });
      if (!warehouse) throw new ConflictException('No central warehouse location is configured');

      for (const item of invoice.items) {
        if (item.receivedQty! > 0) {
          await this.inventory.applyMovement(tx, {
            locationId: warehouse.id,
            productId: item.productId!,
            quantity: item.receivedQty!,
            type: MovementType.RECEIPT,
            reference: invoice.code,
            reason: `Supplier invoice ${invoice.invoiceNumber} — ${invoice.supplierName}`,
            userId: user.userId,
          });
        }
      }

      return { code: invoice.code, supplierName: invoice.supplierName };
    });

    await this.activity.log(`Stock receipt confirmed for ${result.code} (${result.supplierName})`, 'inventory', user.userId);
    // Read AFTER the transaction has committed: reading inside it (through the shared client) returned the pre-commit
    // state, so the response used to say UNDER_REVIEW for an invoice that had just been confirmed.
    return this.get(id);
  }

  async cancel(id: string, user: AuthUser) {
    const invoice = await this.prisma.supplierInvoice.findUniqueOrThrow({ where: { id } });
    if (!OPEN_STATUSES.includes(invoice.status)) {
      throw new ConflictException(`Cannot cancel an invoice in status ${invoice.status}`);
    }
    const updated = await this.prisma.supplierInvoice.update({ where: { id }, data: { status: SupplierInvoiceStatus.CANCELLED } });
    await this.activity.log(`Supplier invoice ${updated.code} cancelled`, 'inventory', user.userId);
    return updated;
  }

  async getSourceFile(id: string) {
    const invoice = await this.prisma.supplierInvoice.findUniqueOrThrow({ where: { id } });
    if (!invoice.sourceFileData) throw new NotFoundException('No source file stored for this invoice');
    return invoice;
  }
}
