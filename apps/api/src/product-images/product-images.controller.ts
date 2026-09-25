import { Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import type { Express } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { ProductImagesService } from './product-images.service';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — a product photo, not a document

/**
 * Catalog enrichment only. Every mutating action here is manager/admin-only
 * (matches ProductsController's own create/update/deactivate gating);
 * GET is open to everyone the way product/category data already is, since
 * an image is exactly as sensitive as the product name it illustrates —
 * never a stock number.
 */
@Controller('products/:productId/image')
export class ProductImagesController {
  constructor(private images: ProductImagesService) {}

  @Get()
  get(@Param('productId') productId: string) {
    return this.images.get(productId);
  }

  @Get('file')
  async file(@Param('productId') productId: string, @Res() res: Response) {
    const image = await this.images.getFile(productId);
    res.setHeader('Content-Type', image.imageMimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(image.imageData);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post('lookup')
  lookup(@Param('productId') productId: string) {
    return this.images.lookupAndSave(productId);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post('search-again')
  searchAgain(@Param('productId') productId: string) {
    return this.images.searchAgain(productId);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post('approve')
  approve(@Param('productId') productId: string, @CurrentUser() user: AuthUser) {
    return this.images.approve(productId, user);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@Param('productId') productId: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    if (!file) throw new Error('No file uploaded');
    return this.images.manualUpload(productId, { buffer: file.buffer, mimetype: file.mimetype }, user);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Delete()
  remove(@Param('productId') productId: string) {
    return this.images.remove(productId);
  }
}
