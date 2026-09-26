/**
 * A SYNTHETIC invoice in the columnar layout (product line + batch/expiry line) used by the columnar-invoice tests.
 * All names, numbers and addresses are invented; the real supplier invoice is never stored in the repository.
 * It deliberately contains: a paid line with its free-of-charge twin, a carton-priced line, a CNF and a PC line, and a
 * batch line that lands on the next page (as it does on real multi-page invoices).
 */
export const HEADER_LINES = ['INVOICE', '90000001', '19.09.2026', '1 2', '555001', 'TEST CUSTOMER', 'EXAMPLE STREET 1', '10000 CITY 11 Germany TEL. 0049000000', 'DE000000000 TEST 0000000000 EUR DAP', '5 - BANK TRANSFER 30DAYS INV.DATE - 1.234,56 00000000', '00000001 000 TESTVILLE 000000 0005'];

export const ROW_LINES = {
  gingerPaid: '1001 TEST GINGER BEER 24x330ML IT CAR 15 24,000 0,000 360,000 0,56 201,60 41%',
  gingerFree: '1001 TEST GINGER BEER 24x330ML IT CAR 3 24,000 0,000 72,000 0,00 0,00 41%',
  noodles: '1002 TEST NOODLES 40x75GR ID CAR 5 40,000 0,000 200,000 11,44 57,20 41%',
  spice: '1003 TEST SPICE MIX 12x10GR MA CNF 3 12,000 0,000 36,000 0,96 34,56 41%',
  sauce: '1004 TEST SAUCE 6x400G GB CAR 4 6,000 0,000 24,000 2,00 48,00 41%',
  promo: '1 TEST PROMO ITEM CO PC 2 1,000 0,000 2,000 0,00 0,00 41%',
};
export const BATCH = (n: string, d: string) => `Cod.Int.: ${n} L/Data: ${d}\t`;
export const TOTAL_LINES = ['Exempt art 41 DPR', '341,36 0 0,00 341,36 Payment: Up to 19.10.2026 341,36', '0,00', '341,36'];

/** Page 1 ends with the sauce line; its batch line is the first line of page 2 (a real multi-page quirk). */
export function fixtureText(opts: { total?: string } = {}): string {
  const total = opts.total ?? '341,36';
  return [
    ...HEADER_LINES,
    ROW_LINES.gingerPaid, BATCH('900001', '03.09.2027'),
    '_____________________________________',
    ROW_LINES.gingerFree, BATCH('900001', '03.09.2027'),
    ROW_LINES.noodles, BATCH('900002', '01.12.2026'),
    ROW_LINES.spice, BATCH('900003', '25.11.2027'),
    ROW_LINES.sauce,
    '', '-- 1 of 2 --', '',
    'INVOICE', '90000001', '19.09.2026', '2 2', '555001', 'TEST CUSTOMER', 'EXAMPLE STREET 1',
    BATCH('900004', '30.05.2028'),
    ROW_LINES.promo, BATCH('900005', '31.12.2035'),
    'Exempt art 41 DPR', `${total} 0 0,00 ${total} Payment: Up to 19.10.2026 ${total}`, '0,00', total,
    '-- 2 of 2 --',
  ].join('\n');
}

/** A minimal single-page PDF WITH a text layer containing `lines` (small font so the long rows fit). */
export function textPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, '\\$&').replace(/\t/g, ' ');
  const stream = `BT /F1 7 Tf 30 800 Td 9 TL\n${lines.map((l) => `(${esc(l)}) Tj T*`).join('\n')}\nET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
