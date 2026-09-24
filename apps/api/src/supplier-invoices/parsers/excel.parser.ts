import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { ParsedInvoice, SupplierInvoiceParser } from './types';
import { detectColumns, rowFromRecord } from './column-map';

@Injectable()
export class ExcelInvoiceParser implements SupplierInvoiceParser {
  supports(mimeType: string, filename: string) {
    const lower = filename.toLowerCase();
    return (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('ms-excel') ||
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xlsm') ||
      lower.endsWith('.xls')
    );
  }

  async parse(buffer: Buffer): Promise<ParsedInvoice> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount === 0) {
      return { header: {}, rows: [], warnings: ['The workbook has no data on its first sheet.'] };
    }

    // Find the first non-empty row and treat it as the header — supplier
    // workbooks sometimes have a title/logo row above the real table, so we
    // scan a few rows rather than assuming row 1 is always it.
    let headerRowNumber = 0;
    let headers: string[] = [];
    for (let r = 1; r <= Math.min(sheet.rowCount, 10); r++) {
      const values = (sheet.getRow(r).values as unknown[]).slice(1).map((v) => String(v ?? '').trim());
      const nonEmpty = values.filter(Boolean);
      if (nonEmpty.length >= 2) {
        headers = values;
        headerRowNumber = r;
        break;
      }
    }
    if (!headerRowNumber) {
      return { header: {}, rows: [], warnings: ['Could not find a header row in the first 10 rows of the sheet.'] };
    }
    const cols = detectColumns(headers);

    const rows: ParsedInvoice['rows'] = [];
    const warnings: string[] = [];
    for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
      const values = (sheet.getRow(r).values as unknown[]).slice(1);
      if (values.every((v) => v === null || v === undefined || v === '')) continue;
      const record: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (h) record[h] = values[i];
      });
      const { row, issue } = rowFromRecord(record, cols);
      if (issue) warnings.push(issue);
      if (row) rows.push(row);
    }

    return { header: {}, rows, warnings };
  }
}
