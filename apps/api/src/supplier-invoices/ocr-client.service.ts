import { Injectable, Logger } from '@nestjs/common';

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OcrResult {
  text: string;
  pages: OcrPageResult[];
  confidence: number;
  processingTimeMs: number;
}

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL ?? 'http://ocr:8000';
const TIMEOUT_MS = 90_000; // scanned multi-page invoices on CPU can genuinely take a while — see apps/ocr/app/ocr_engine.py

/**
 * The only thing that talks to the OCR microservice (see apps/ocr) — HTTP
 * client only, no business logic here. Called exclusively by
 * PdfInvoiceParser, and only when pdf-parse's own text layer turned out to
 * be insufficient (see isTextSufficient in pdf.parser.ts); a normal
 * machine-readable invoice never reaches this class at all.
 */
@Injectable()
export class OcrClientService {
  private readonly logger = new Logger(OcrClientService.name);

  /** Never throws — a null return means "OCR unavailable or failed", which the caller treats as recoverable (see PdfInvoiceParser). */
  async extractText(buffer: Buffer, filename: string): Promise<OcrResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), filename);
      const res = await fetch(`${OCR_SERVICE_URL}/ocr`, { method: 'POST', body: form, signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`OCR service returned ${res.status} for ${filename}`);
        return null;
      }
      return (await res.json()) as OcrResult;
    } catch (err) {
      this.logger.warn(`OCR service unreachable/failed for ${filename}: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
