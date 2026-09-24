import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.categories.list(includeInactive === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.categories.get(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.categories.deactivate(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.categories.activate(id);
  }
}
