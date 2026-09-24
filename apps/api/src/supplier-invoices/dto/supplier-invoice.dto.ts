import { IsDateString, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UploadSupplierInvoiceDto {
  @IsString()
  @MinLength(1)
  supplierName!: string;

  @IsString()
  @MinLength(1)
  invoiceNumber!: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;
}

export class UpdateSupplierInvoiceItemDto {
  @IsOptional()
  @IsString()
  productId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  receivedQty?: number;
}
