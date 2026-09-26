import { Module } from '@nestjs/common';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { ImportMatchingService } from './matching.service';
import { CsvInvoiceParser } from './parsers/csv.parser';
import { ExcelInvoiceParser } from './parsers/excel.parser';
import { PdfInvoiceParser } from './parsers/pdf.parser';
import { OcrClientService } from './ocr-client.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [InventoryModule, ActivityModule],
  providers: [SupplierInvoicesService, ImportMatchingService, CsvInvoiceParser, ExcelInvoiceParser, PdfInvoiceParser, OcrClientService],
  controllers: [SupplierInvoicesController],
  exports: [SupplierInvoicesService],
})
export class SupplierInvoicesModule {}
