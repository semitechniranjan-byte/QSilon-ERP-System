import PDFDocument from 'pdfkit';
import { mtext, registerFonts } from './fonts.js';
import { fmtDate, inr, t, type Lang } from './labels.js';

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/** Render a receipt from its immutable snapshot. Rendering never changes any financial record. */
export async function renderReceiptPdf(r: any, lang: Lang, logo?: Buffer | null): Promise<Buffer> {
  const s = r.snapshot;
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Receipt ${r.receipt_no}`, Author: s.school.name } });
  const done = collect(doc);
  registerFonts(doc);
  const W = doc.page.width - 80;
  const X = 40;
  const brand = '#1d4774';

  // Header
  let y = 40;
  if (logo) {
    try { doc.image(logo, X, y, { fit: [60, 60] }); } catch { /* ignore unsupported image */ }
  }
  const hx = logo ? X + 72 : X;
  doc.fillColor(brand).fontSize(18);
  mtext(doc, lang === 'hi' && s.school.nameHi ? s.school.nameHi : s.school.name, hx, y, { width: W - (hx - X), bold: true });
  doc.fillColor('#333').fontSize(9);
  if (s.school.address) mtext(doc, s.school.address, hx, doc.y + 2, { width: W - (hx - X) });
  const contact = [s.school.phone, s.school.email].filter(Boolean).join('  |  ');
  if (contact) mtext(doc, contact, hx, doc.y + 1, { width: W - (hx - X) });
  y = Math.max(doc.y, 100) + 8;
  doc.moveTo(X, y).lineTo(X + W, y).lineWidth(1.5).strokeColor(brand).stroke();
  y += 8;
  doc.fillColor(brand).fontSize(14);
  mtext(doc, t(lang, 'feeReceipt'), X, y, { width: W, align: 'center', bold: true });
  y = doc.y + 6;

  // Details grid
  const st = s.student;
  const rows: [string, string][] = [
    [t(lang, 'receiptNo'), r.receipt_no], [t(lang, 'date'), fmtDate(s.payment.paidOn)],
    [t(lang, 'studentName'), lang === 'hi' && st.nameHi ? `${st.nameHi} (${st.name})` : st.name], [t(lang, 'studentId'), st.code],
    [t(lang, 'admissionNo'), st.admissionNo], [t(lang, 'rollNo'), String(st.rollNo ?? '-')],
    [t(lang, 'classSection'), `${lang === 'hi' && st.classNameHi ? st.classNameHi : st.className ?? '-'} / ${st.section ?? '-'}`], [t(lang, 'academicYear'), st.year ?? '-'],
    [t(lang, 'guardian'), st.guardianName ?? '-'], [t(lang, 'mode'), t(lang, s.payment.mode as any) + (s.payment.reference ? ` – ${s.payment.reference}` : '')],
  ];
  doc.fontSize(9.5).fillColor('#111');
  const colW = W / 2;
  for (let i = 0; i < rows.length; i += 2) {
    const rowY = y;
    let maxY = rowY;
    for (let j = 0; j < 2; j++) {
      const [k, v] = rows[i + j] ?? ['', ''];
      if (!k) continue;
      const cx = X + j * colW;
      doc.fillColor('#555');
      mtext(doc, k, cx, rowY, { width: 110 });
      doc.fillColor('#111');
      mtext(doc, v, cx + 112, rowY, { width: colW - 116, bold: true });
      maxY = Math.max(maxY, doc.y);
    }
    y = maxY + 4;
  }
  y += 6;

  // Items table
  const cols = [
    { k: t(lang, 'particulars'), w: W * 0.4, a: 'left' as const },
    { k: t(lang, 'amount'), w: W * 0.15, a: 'right' as const },
    { k: t(lang, 'concession'), w: W * 0.15, a: 'right' as const },
    { k: t(lang, 'due'), w: W * 0.15, a: 'right' as const },
    { k: t(lang, 'paid'), w: W * 0.15, a: 'right' as const },
  ];
  doc.rect(X, y, W, 20).fill('#e8eff7');
  let cx = X;
  doc.fillColor(brand).fontSize(9);
  for (const c of cols) { mtext(doc, c.k, cx + 4, y + 5, { width: c.w - 8, align: c.a, bold: true }); cx += c.w; }
  y += 22;
  doc.fillColor('#111').fontSize(9);
  for (const it of s.items) {
    const cells = [`${it.description}${it.invoiceNo ? `\n${it.invoiceNo}` : ''}`, inr(it.amount), inr(it.discount + (it.adjusted || 0)), inr(it.dueBefore), inr(it.paid)];
    cx = X;
    let rowBottom = y;
    cells.forEach((v, i) => {
      mtext(doc, v, cx + 4, y + 3, { width: cols[i].w - 8, align: cols[i].a });
      rowBottom = Math.max(rowBottom, doc.y);
      cx += cols[i].w;
    });
    y = rowBottom + 4;
    doc.moveTo(X, y).lineTo(X + W, y).lineWidth(0.5).strokeColor('#ccd').stroke();
    y += 2;
    if (y > doc.page.height - 260) { doc.addPage(); y = 40; }
  }
  y += 8;

  // Totals
  const totals: [string, string, boolean?][] = [
    [t(lang, 'totalDue'), inr(s.totals.totalDueBefore)],
    [t(lang, 'previousBalance'), inr(s.totals.previousBalance)],
    [t(lang, 'concessions'), inr(s.totals.concessions)],
    [t(lang, 'amountPaid'), inr(s.totals.amountPaid), true],
    [t(lang, 'remaining'), inr(s.totals.balanceAfter), true],
  ];
  doc.fontSize(10);
  for (const [k, v, b] of totals) {
    doc.fillColor('#333');
    mtext(doc, k, X + W * 0.35, y, { width: W * 0.42, align: 'right', bold: b });
    doc.fillColor('#111');
    mtext(doc, v, X + W * 0.78, y, { width: W * 0.22, align: 'right', bold: b });
    y = doc.y + 3;
  }
  y += 6;
  // Clearance status: derived strictly from the recorded balance after this payment.
  const cleared = s.totals.balanceAfter === 0;
  doc.roundedRect(X, y, W, 26, 4).fill(cleared ? '#e6f4ea' : '#fdf1e1');
  doc.fillColor(cleared ? '#1e7d36' : '#a35a00').fontSize(12);
  mtext(doc, cleared ? t(lang, 'feesCleared') : `${t(lang, 'balanceRemaining')}: ${inr(s.totals.balanceAfter)}`, X, y + 6, { width: W, align: 'center', bold: true });
  y += 36;
  doc.fillColor('#555').fontSize(8.5);
  if (s.payment.receivedBy) mtext(doc, `${t(lang, 'receivedBy')}: ${s.payment.receivedBy}`, X, y, { width: W });
  y = doc.y + 40;

  // Signature areas — left blank deliberately; nothing here claims anyone has signed.
  const sigW = (W - 40) / 3;
  [t(lang, 'sigSchool'), t(lang, 'sigParent'), t(lang, 'sigStudent')].forEach((label, i) => {
    const sx = X + i * (sigW + 20);
    doc.moveTo(sx, y).lineTo(sx + sigW, y).lineWidth(0.8).strokeColor('#444').stroke();
    doc.fillColor('#333').fontSize(8.5);
    mtext(doc, label, sx, y + 4, { width: sigW, align: 'center' });
  });
  y += 30;
  doc.fillColor('#777').fontSize(7.5);
  mtext(doc, t(lang, 'computerGenerated'), X, y, { width: W, align: 'center' });

  if (r.status === 'cancelled') {
    doc.save().rotate(-30, { origin: [300, 400] }).fillColor('#c62828').opacity(0.25).fontSize(80);
    mtext(doc, t(lang, 'cancelled'), 60, 360, { width: 500, align: 'center', bold: true });
    doc.restore();
  }
  doc.end();
  return done;
}
