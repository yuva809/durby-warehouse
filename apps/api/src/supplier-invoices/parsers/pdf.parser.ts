import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import type { ParsedInvoice, SupplierInvoiceParser } from './types';
import { parseInvoiceTextLines } from './text-row-parser';
import { OcrClientService } from '../ocr-client.service';

// Below this many non-whitespace characters, pdf-parse's text layer is
// treated as "not usable" — a genuinely scanned/image-only PDF typically
// extracts to nothing or a handful of stray characters (headers/footers
// baked into the page as real text even though the body is a photo),
// nowhere close to a real invoice with a dozen+ product lines.
const MIN_USABLE_TEXT_CHARS = 40;

/**
 * Best-effort text extraction for supplier invoice PDFs — deliberately NOT
 * a full layout-AI pipeline. Two text sources, same downstream heuristic
 * row-parser (text-row-parser.ts):
 *   1. pdf-parse's text layer, for normal machine-readable PDFs — the
 *      common case, and the ONLY case for a well-formed invoice export.
 *   2. PaddleOCR (apps/ocr), only when (1) comes back insufficient — a
 *      scanned/image-only PDF. This never runs for a normal PDF; see
 *      isTextSufficient below.
 * Every row this parser produces is marked needsReview regardless of how
 * confident the match looks, because heuristic text-line parsing (whichever
 * source produced the text) is inherently unreliable — the manager always
 * checks it. A clean, swappable SupplierInvoiceParser implementation either way.
 */
@Injectable()
export class PdfInvoiceParser implements SupplierInvoiceParser {
  constructor(private ocr: OcrClientService) {}

  supports(mimeType: string, filename: string) {
    return mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
  }

  private async extractTextLayer(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text ?? '';
    } finally {
      await parser.destroy();
    }
  }

  async parse(buffer: Buffer): Promise<ParsedInvoice> {
    const textLayer = await this.extractTextLayer(buffer);
    const isTextSufficient = textLayer.replace(/\s/g, '').length >= MIN_USABLE_TEXT_CHARS;

    let text = textLayer;
    const warnings: string[] = [];

    if (isTextSufficient) {
      warnings.push('This file was parsed from the PDF\'s text layer using a best-effort line heuristic — please verify every row before confirming.');
    } else {
      // Insufficient/no text layer — almost certainly a scanned/image-only
      // PDF. Fall back to PaddleOCR. This is the ONLY path that ever calls
      // the OCR service; a normal invoice never reaches here.
      const ocrResult = await this.ocr.extractText(buffer, 'invoice.pdf');
      if (!ocrResult) {
        // OCR unreachable/failed — never corrupt or fabricate invoice data.
        // Returning zero rows (rather than throwing) keeps the upload
        // itself recoverable: SupplierInvoicesService.upload() surfaces
        // this as "no rows found", and the manager can retry the upload or
        // add lines manually, exactly the "OCR failure -> recoverable
        // review state" the spec requires.
        return {
          header: {},
          rows: [],
          warnings: [
            'This PDF has no usable text layer (likely a scanned image) and the OCR service could not process it right now — try uploading again, or re-export the invoice as CSV/XLSX instead.',
          ],
          forceReview: true,
        };
      }
      text = ocrResult.text;
      const confidencePct = Math.round(ocrResult.confidence * 100);
      warnings.push(
        `This file had no usable text layer, so it was read with OCR (PaddleOCR) across ${ocrResult.pages.length} page${ocrResult.pages.length === 1 ? '' : 's'}, average confidence ${confidencePct}% — please verify every row carefully before confirming.`,
      );
    }

    const { header, rows, issues } = parseInvoiceTextLines(text);
    warnings.push(...issues);
    if (rows.length === 0) {
      warnings.push('No product rows could be detected automatically — this PDF may use an unsupported layout. Add items manually on the review screen.');
    }

    return { header, rows, warnings, forceReview: true };
  }
}
