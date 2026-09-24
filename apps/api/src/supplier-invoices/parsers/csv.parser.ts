import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import type { ParsedInvoice, SupplierInvoiceParser } from './types';
import { detectColumns, rowFromRecord } from './column-map';

@Injectable()
export class CsvInvoiceParser implements SupplierInvoiceParser {
  supports(mimeType: string, filename: string) {
    return mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel' || filename.toLowerCase().endsWith('.csv');
  }

  async parse(buffer: Buffer): Promise<ParsedInvoice> {
    const records: Record<string, unknown>[] = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
    if (records.length === 0) {
      return { header: {}, rows: [], warnings: ['The CSV file has no data rows.'] };
    }
    const cols = detectColumns(Object.keys(records[0]));

    const rows: ParsedInvoice['rows'] = [];
    const warnings: string[] = [];
    for (const record of records) {
      const { row, issue } = rowFromRecord(record, cols);
      if (issue) warnings.push(issue);
      if (row) rows.push(row);
    }
    // A supplier/invoice-number/date header block isn't a structured concept
    // in a flat CSV — left for the manager to fill in on the review screen.
    return { header: {}, rows, warnings };
  }
}
