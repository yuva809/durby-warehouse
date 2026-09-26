import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { MAX_QUANTITY } from '../../common/limits';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  pack?: string;

  @IsString()
  unit!: string;

  /** Individual units in one stock unit (e.g. 24 bottles per carton). Reference/reporting only. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  packSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  minStock?: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  pack?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  packSize?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
