import PDFDocument from 'pdfkit';
import { mtext, registerFonts } from './fonts.js';
import { fmtDate, t, type Lang } from './labels.js';

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export async function renderReportCardPdf(d: any, school: any, lang: Lang, logo?: Buffer | null): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Report card ${d.student.student_code}` } });
  const done = collect(doc);
  registerFonts(doc);
  const X = 40, W = doc.page.width - 80, brand = '#1d4774';
  const hi = lang === 'hi';
  let y = 40;
  if (logo) { try { doc.image(logo, X, y, { fit: [56, 56] }); } catch { /* ignore */ } }
  const hx = logo ? X + 68 : X;
  doc.fillColor(brand).fontSize(17);
  mtext(doc, hi && school.name_hi ? school.name_hi : school.name, hx, y, { width: W - (hx - X), bold: true });
  doc.fillColor('#333').fontSize(9);
  const addr = [school.address, school.city, school.state, school.pincode].filter(Boolean).join(', ');
  if (addr) mtext(doc, addr, hx, doc.y + 2, { width: W - (hx - X) });
  y = Math.max(doc.y, 96) + 6;
  doc.moveTo(X, y).lineTo(X + W, y).lineWidth(1.5).strokeColor(brand).stroke();
  y += 8;
  doc.fillColor(brand).fontSize(14);
  mtext(doc, `${t(lang, d.mode === 'descriptive' ? 'progressCard' : 'reportCard')} – ${d.exam.name} (${d.year?.name ?? ''})`, X, y, { width: W, align: 'center', bold: true });
  y = doc.y + 8;

  const st = d.student;
  const info: [string, string][] = [
    [t(lang, 'studentName'), hi && st.name_hi ? st.name_hi : [st.first_name, st.last_name].filter(Boolean).join(' ')],
    [t(lang, 'studentId'), st.student_code], [t(lang, 'admissionNo'), st.admission_no], [t(lang, 'rollNo'), String(st.roll_no)],
    [t(lang, 'classSection'), `${hi && st.class_name_hi ? st.class_name_hi : st.class_name} / ${st.section_name}`], [t(lang, 'dob'), st.dob ? fmtDate(st.dob) : '-'],
  ];
  doc.fontSize(9.5);
  for (let i = 0; i < info.length; i += 2) {
    let maxY = y;
    for (let j = 0; j < 2; j++) {
      const [k, v] = info[i + j];
      const cx = X + j * (W / 2);
      doc.fillColor('#555'); mtext(doc, k, cx, y, { width: 100 });
      doc.fillColor('#111'); mtext(doc, v, cx + 102, y, { width: W / 2 - 106, bold: true });
      maxY = Math.max(maxY, doc.y);
    }
    y = maxY + 4;
  }
  y += 8;

  const header = (cols: { k: string; w: number; a: 'left' | 'center' | 'right' }[]) => {
    doc.rect(X, y, W, 20).fill('#e8eff7');
    let cx = X;
    doc.fillColor(brand).fontSize(9);
    for (const c of cols) { mtext(doc, c.k, cx + 4, y + 5, { width: c.w - 8, align: c.a, bold: true }); cx += c.w; }
    y += 22;
  };
  const row = (cols: { w: number; a: 'left' | 'center' | 'right' }[], cells: string[]) => {
    let cx = X, bottom = y;
    doc.fillColor('#111').fontSize(9);
    cells.forEach((v, i) => { mtext(doc, v, cx + 4, y + 3, { width: cols[i].w - 8, align: cols[i].a }); bottom = Math.max(bottom, doc.y); cx += cols[i].w; });
    y = bottom + 4;
    doc.moveTo(X, y).lineTo(X + W, y).lineWidth(0.5).strokeColor('#ccd').stroke();
    y += 2;
  };

  if (d.mode === 'marks') {
    const cols = [
      { k: t(lang, 'subject'), w: W * 0.4, a: 'left' as const }, { k: t(lang, 'maxMarks'), w: W * 0.15, a: 'center' as const },
      { k: t(lang, 'obtained'), w: W * 0.15, a: 'center' as const }, { k: t(lang, 'grade'), w: W * 0.15, a: 'center' as const },
      { k: t(lang, 'result'), w: W * 0.15, a: 'center' as const },
    ];
    header(cols);
    for (const s of st.subjects) {
      row(cols, [hi && s.subjectHi ? s.subjectHi : s.subject, String(s.maxMarks), s.isAbsent ? t(lang, 'absent') : s.obtained == null ? '—' : String(s.obtained),
        s.grade ?? '—', s.passed == null ? '—' : s.passed ? t(lang, 'passShort') : t(lang, 'failShort')]);
    }
    y += 6;
    const summary: [string, string][] = [
      [t(lang, 'total'), `${st.total} / ${st.max}`], [t(lang, 'percentage'), st.percent == null ? '—' : `${st.percent}%`],
      [t(lang, 'grade'), st.grade ?? '—'], [t(lang, 'result'), st.result === 'pass' ? t(lang, 'pass') : st.result === 'fail' ? t(lang, 'fail') : '—'],
      [t(lang, 'attendance'), st.attendancePercent == null ? '—' : `${st.attendancePercent}%`],
    ];
    doc.fontSize(10);
    for (const [k, v] of summary) {
      doc.fillColor('#333'); mtext(doc, k, X, y, { width: 160, bold: true });
      doc.fillColor('#111'); mtext(doc, v, X + 165, y, { width: 200 });
      y = doc.y + 3;
    }
  } else {
    const cols = [{ k: t(lang, 'domain'), w: W * 0.35, a: 'left' as const }, { k: t(lang, 'rating'), w: W * 0.2, a: 'center' as const }, { k: t(lang, 'comment'), w: W * 0.45, a: 'left' as const }];
    header(cols);
    for (const r of st.ratings) row(cols, [hi && r.domainHi ? r.domainHi : r.domain, r.rating ? t(lang, r.rating) : '—', r.comment ?? '']);
    y += 6;
    doc.fontSize(10).fillColor('#333');
    mtext(doc, `${t(lang, 'attendance')}: ${st.attendancePercent == null ? '—' : st.attendancePercent + '%'}`, X, y, { width: W });
    y = doc.y + 3;
  }
  y += 8;
  for (const [k, v] of [[t(lang, 'teacherRemark'), st.teacherRemark], [t(lang, 'principalRemark'), st.principalRemark]] as [string, string | null][]) {
    doc.fillColor(brand).fontSize(9.5); mtext(doc, k, X, y, { width: W, bold: true });
    doc.fillColor('#111').fontSize(9.5); mtext(doc, v || ' ', X, doc.y + 2, { width: W });
    y = doc.y + 8;
  }
  y = Math.max(y + 40, doc.page.height - 120);
  const sigW = (W - 40) / 3;
  [t(lang, 'sigClassTeacher'), t(lang, 'sigPrincipal'), t(lang, 'sigParent')].forEach((label, i) => {
    const sx = X + i * (sigW + 20);
    doc.moveTo(sx, y).lineTo(sx + sigW, y).lineWidth(0.8).strokeColor('#444').stroke();
    doc.fillColor('#333').fontSize(8.5); mtext(doc, label, sx, y + 4, { width: sigW, align: 'center' });
  });
  doc.end();
  return done;
}
