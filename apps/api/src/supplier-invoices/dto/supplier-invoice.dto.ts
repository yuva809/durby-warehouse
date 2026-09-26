import { IsDateString, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { MAX_INVOICE_QTY } from '../parsers/quantity';

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
  @Max(MAX_INVOICE_QTY)
  receivedQty?: number;
}
