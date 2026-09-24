import { Body, Controller, Get, Param, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import type { Express } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { UpdateSupplierInvoiceItemDto, UploadSupplierInvoiceDto } from './dto/supplier-invoice.dto';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — comfortably above any real invoice, small enough to store as a DB row without special-casing

@Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
@Controller('supplier-invoices')
export class SupplierInvoicesController {
  constructor(private invoices: SupplierInvoicesService) {}

  @Get()
  list() {
    return this.invoices.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const invoice = await this.invoices.getSourceFile(id);
    res.setHeader('Content-Type', invoice.sourceFileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.sourceFileName || invoice.code}"`);
    res.send(invoice.sourceFileData);
  }

  /**
   * Upload -> parse -> match, nothing else. Never changes inventory — see
   * SupplierInvoicesService.upload(). File size capped well below anything a
   * real invoice needs; NestJS/multer rejects anything larger before it
   * reaches this handler.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadSupplierInvoiceDto, @CurrentUser() user: AuthUser) {
    if (!file) throw new Error('No file uploaded');
    return this.invoices.upload({ buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype }, dto, user);
  }

  @Patch(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateSupplierInvoiceItemDto) {
    return this.invoices.updateItem(id, itemId, dto);
  }

  /** The only endpoint that can add stock from a supplier invoice — see SupplierInvoicesService.confirm() for the concurrency/idempotency guarantee. */
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.confirm(id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoices.cancel(id, user);
  }
}
