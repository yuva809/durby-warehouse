import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';

// Asia Might Super Market's brand palette — the documents should read as
// the same product as the rest of the app, not a mismatched letterhead.
const INK = '#0c2b21';
const BRAND = '#2f8f66';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

export interface OrderConfirmationData {
  /** Customer-facing document number (OC-000001) — what's shown as the document's own number. */
  ocNumber: string;
  /** Internal request code (REQ-1024) — kept as a small secondary reference line for traceability. */
  code: string;
  branchName: string;
  branchCity?: string | null;
  createdAt: Date;
  status: string;
  createdByName: string;
  items: { productName: string; category: string; unit: string; requestedQty: number; approvedQty: number | null }[];
}

export interface DeliveryChallanData {
  /** Customer-facing document number (DC-000001) — what's shown as the document's own number. */
  dcNumber: string;
  /** Internal transfer code (TR-1024) — kept as a small secondary reference line for traceability. */
  code: string;
  /** Customer-facing Order Confirmation number this delivery fulfills. */
  ocNumber: string;
  requestCode: string;
  branchName: string;
  branchCity?: string | null;
  warehouseName: string;
  warehouseCity?: string | null;
  dispatchDate: Date | null;
  deliveredAt: Date | null;
  status: string;
  driverName: string | null;
  items: {
    productName: string;
    category: string;
    unit: string;
    approvedQty: number;
    pickedQty: number | null;
    deliveredQty: number | null;
    shortageReason: string | null;
  }[];
}

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width in points minus margins

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Every method here builds a PDF directly from the data it's handed — never
 * from a PDF, and the caller is always the one that already ran the real
 * authorization check (this service has no idea who's allowed to see what).
 * Nothing is persisted; the database stays the single source of truth and
 * the document is simply re-rendered fresh on every download.
 */
@Injectable()
export class DocumentsService {
  private letterhead(doc: PDFKit.PDFDocument, title: string, docNo: string, lines: string[]) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text('ASIA MIGHT', PAGE_MARGIN, PAGE_MARGIN);
    doc.fillColor(BRAND).font('Helvetica').fontSize(9).text('SUPER MARKET', PAGE_MARGIN, PAGE_MARGIN + 24);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(title, PAGE_MARGIN, PAGE_MARGIN, { width: CONTENT_WIDTH, align: 'right' });
    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    let y = PAGE_MARGIN + 20;
    for (const line of [docNo, ...lines]) {
      doc.text(line, PAGE_MARGIN, y, { width: CONTENT_WIDTH, align: 'right' });
      y += 13;
    }

    // Computed from how many lines were actually drawn on the right — a
    // fixed offset here overlapped the last line whenever a caller (the
    // Delivery Challan, with 5 lines vs. the Order Confirmation's 3) passed
    // more lines than the original fixed budget allowed for. Caught by
    // extracting real text from a generated PDF during testing, not by eye.
    const rightHeight = 20 + 13 * (1 + lines.length);
    const leftHeight = 24 + 12;
    const ruleY = PAGE_MARGIN + Math.max(rightHeight, leftHeight) + 6;
    doc.moveTo(PAGE_MARGIN, ruleY).lineTo(PAGE_MARGIN + CONTENT_WIDTH, ruleY).strokeColor(BRAND).lineWidth(1.5).stroke();
    return ruleY + 18;
  }

  private partyBlock(doc: PDFKit.PDFDocument, y: number, left: { label: string; value: string }, right?: { label: string; value: string }) {
    const colWidth = right ? CONTENT_WIDTH / 2 - 10 : CONTENT_WIDTH;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(left.label.toUpperCase(), PAGE_MARGIN, y, { width: colWidth });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(left.value, PAGE_MARGIN, y + 12, { width: colWidth });
    if (right) {
      const rx = PAGE_MARGIN + CONTENT_WIDTH / 2 + 10;
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(right.label.toUpperCase(), rx, y, { width: colWidth });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(right.value, rx, y + 12, { width: colWidth });
    }
    return y + 40;
  }

  private tableHeader(doc: PDFKit.PDFDocument, y: number, columns: { label: string; x: number; width: number; align?: 'left' | 'right' }[]) {
    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 22).fill(INK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), col.x, y + 7, { width: col.width, align: col.align ?? 'left' });
    }
    return y + 22;
  }

  private footerSignatures(doc: PDFKit.PDFDocument, y: number, fields: string[]) {
    const colWidth = CONTENT_WIDTH / fields.length;
    fields.forEach((label, i) => {
      const x = PAGE_MARGIN + i * colWidth;
      doc.moveTo(x, y + 28).lineTo(x + colWidth - 20, y + 28).strokeColor(LINE).lineWidth(1).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label, x, y + 32, { width: colWidth - 20 });
    });
  }

  /** Represents what the branch originally requested — immutable even after the manager approves less. */
  renderOrderConfirmation(res: Response, data: OrderConfirmationData) {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Order-Confirmation-${data.ocNumber}.pdf"`);
    doc.pipe(res);

    // Customer-facing document number only — the internal REQ- code (still
    // on `data.code` for internal/API use) is deliberately never rendered
    // into the PDF body. See DeliveryChallanData below for the same rule.
    let y = this.letterhead(doc, 'ORDER CONFIRMATION', `Order No: ${data.ocNumber}`, [
      `Date: ${formatDate(data.createdAt)}`,
      `Status: ${data.status}`,
    ]);

    y = this.partyBlock(
      doc,
      y,
      { label: 'Requesting Branch', value: data.branchName + (data.branchCity ? `, ${data.branchCity}` : '') },
      { label: 'Requested By', value: data.createdByName },
    );

    const cols = [
      { label: '#', x: PAGE_MARGIN + 6, width: 20 },
      { label: 'Product', x: PAGE_MARGIN + 28, width: 175 },
      { label: 'Category', x: PAGE_MARGIN + 205, width: 110 },
      { label: 'Unit', x: PAGE_MARGIN + 317, width: 50 },
      { label: 'Requested', x: PAGE_MARGIN + 370, width: 75, align: 'right' as const },
      { label: 'Approved', x: PAGE_MARGIN + 450, width: 75, align: 'right' as const },
    ];
    y = this.tableHeader(doc, y + 6, cols);

    let totalRequested = 0;
    let totalApproved = 0;
    data.items.forEach((item, i) => {
      totalRequested += item.requestedQty;
      totalApproved += item.approvedQty ?? 0;
      const rowY = y + i * 20;
      if (i % 2 === 1) doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, 20).fill('#f7f8f7');
      doc.fillColor(INK).font('Helvetica').fontSize(9);
      doc.text(String(i + 1), cols[0].x, rowY + 6, { width: cols[0].width });
      doc.text(item.productName, cols[1].x, rowY + 6, { width: cols[1].width });
      doc.text(item.category, cols[2].x, rowY + 6, { width: cols[2].width });
      doc.text(item.unit, cols[3].x, rowY + 6, { width: cols[3].width });
      doc.text(String(item.requestedQty), cols[4].x, rowY + 6, { width: cols[4].width, align: 'right' });
      doc.text(item.approvedQty === null ? '—' : String(item.approvedQty), cols[5].x, rowY + 6, { width: cols[5].width, align: 'right' });
    });
    y += data.items.length * 20;
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor(LINE).lineWidth(1).stroke();

    y += 12;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
    doc.text(`Total Requested: ${totalRequested}`, cols[4].x - 90, y, { width: 165, align: 'right' });
    doc.text(`Total Approved: ${totalApproved}`, cols[5].x, y, { width: cols[5].width + 90 - 90, align: 'right' });

    y += 30;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(
      'This Order Confirmation records the quantities requested by the branch and the quantities the warehouse manager approved. ' +
        'It is not a financial invoice — actual quantities dispatched and delivered are recorded separately on the Delivery Challan.',
      PAGE_MARGIN,
      y,
      { width: CONTENT_WIDTH },
    );

    this.footerSignatures(doc, y + 60, ['Prepared By', 'Approved By']);
    doc.end();
  }

  /** Represents what was actually dispatched/delivered — generated once a delivery has happened. */
  renderDeliveryChallan(res: Response, data: DeliveryChallanData) {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Delivery-Challan-${data.dcNumber}.pdf"`);
    doc.pipe(res);

    let y = this.letterhead(doc, 'DELIVERY CHALLAN', `Challan No: ${data.dcNumber}`, [
      `Order No: ${data.ocNumber}`,
      `Dispatched: ${formatDate(data.dispatchDate)}`,
      `Delivered: ${formatDate(data.deliveredAt)}`,
      `Status: ${data.status}`,
    ]);

    y = this.partyBlock(
      doc,
      y,
      { label: 'Dispatched From', value: data.warehouseName + (data.warehouseCity ? `, ${data.warehouseCity}` : '') },
      { label: 'Deliver To', value: data.branchName + (data.branchCity ? `, ${data.branchCity}` : '') },
    );
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('INCHARGE / DRIVER', PAGE_MARGIN, y, { width: CONTENT_WIDTH });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(data.driverName ?? '—', PAGE_MARGIN, y + 12, { width: CONTENT_WIDTH });
    y += 40;

    const cols = [
      { label: '#', x: PAGE_MARGIN + 6, width: 18 },
      { label: 'Product', x: PAGE_MARGIN + 26, width: 130 },
      { label: 'Category', x: PAGE_MARGIN + 158, width: 85 },
      { label: 'Unit', x: PAGE_MARGIN + 245, width: 35 },
      { label: 'Approved', x: PAGE_MARGIN + 282, width: 55, align: 'right' as const },
      { label: 'Delivered', x: PAGE_MARGIN + 340, width: 55, align: 'right' as const },
      { label: 'Note', x: PAGE_MARGIN + 400, width: 125 },
    ];
    y = this.tableHeader(doc, y + 6, cols);

    let totalDispatched = 0;
    data.items.forEach((item, i) => {
      const delivered = item.deliveredQty ?? item.pickedQty ?? 0;
      totalDispatched += delivered;
      const rowShort = delivered < item.approvedQty;
      const rowY = y + i * 22;
      if (i % 2 === 1) doc.rect(PAGE_MARGIN, rowY, CONTENT_WIDTH, 22).fill('#f7f8f7');
      doc.fillColor(INK).font('Helvetica').fontSize(9);
      doc.text(String(i + 1), cols[0].x, rowY + 6, { width: cols[0].width });
      doc.text(item.productName, cols[1].x, rowY + 6, { width: cols[1].width });
      doc.text(item.category, cols[2].x, rowY + 6, { width: cols[2].width });
      doc.text(item.unit, cols[3].x, rowY + 6, { width: cols[3].width });
      doc.text(String(item.approvedQty), cols[4].x, rowY + 6, { width: cols[4].width, align: 'right' });
      doc.fillColor(rowShort ? '#b45309' : INK).font('Helvetica-Bold').text(String(delivered), cols[5].x, rowY + 6, { width: cols[5].width, align: 'right' });
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(item.shortageReason ?? (rowShort ? 'Short' : ''), cols[6].x, rowY + 6, { width: cols[6].width });
    });
    y += data.items.length * 22;
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor(LINE).lineWidth(1).stroke();

    y += 12;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(`Total Dispatched Quantity: ${totalDispatched}`, PAGE_MARGIN, y, { width: CONTENT_WIDTH, align: 'right' });

    y += 30;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(
      'This Delivery Challan confirms the actual quantities dispatched and delivered, which may be less than the approved quantity ' +
        'if items were unavailable, damaged, or short at the time of picking — see the Note column above for the reason where applicable.',
      PAGE_MARGIN,
      y,
      { width: CONTENT_WIDTH },
    );

    this.footerSignatures(doc, y + 60, ['Prepared & Packed By', 'Dispatched By', 'Received By']);
    doc.end();
  }
}
