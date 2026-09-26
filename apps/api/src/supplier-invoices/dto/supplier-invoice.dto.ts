import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
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

  /** The total the uploader expects the invoice to add up to (multipart fields arrive as text). Checked against the document. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  invoiceTotal?: number;
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
