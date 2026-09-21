import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  /**
   * Open to every authenticated role, branches included: this returns
   * catalog data only (name/sku/category/brand/pack/unit) — never a stock
   * number — so a branch browsing/searching what to request is safe here.
   */
  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.products.list(includeInactive === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.products.deactivate(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.products.activate(id);
  }
}
