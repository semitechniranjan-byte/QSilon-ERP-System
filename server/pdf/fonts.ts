import path from 'node:path';
import type PDFKit from 'pdfkit';

const base = path.resolve(process.cwd(), 'node_modules/@fontsource');
export const FONTS = {
  latin: path.join(base, 'noto-sans/files/noto-sans-latin-400-normal.woff'),
  latinBold: path.join(base, 'noto-sans/files/noto-sans-latin-700-normal.woff'),
  dev: path.join(base, 'noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff'),
  devBold: path.join(base, 'noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff'),
};

export function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont('L', FONTS.latin);
  doc.registerFont('LB', FONTS.latinBold);
  doc.registerFont('D', FONTS.dev);
  doc.registerFont('DB', FONTS.devBold);
}

// Devanagari block, Vedic extensions, joiners, rupee sign, dotted circle.
const DEV = /[ऀ-ॿ᳐-᳿‌‍₹◌꠰-꠿꣠-ꣿ]/;

/** Split text into runs so Hindi (and ₹) render with the Devanagari font and everything else with the Latin font. */
export function runs(text: string): { dev: boolean; s: string }[] {
  const out: { dev: boolean; s: string }[] = [];
  for (const ch of text) {
    const dev = DEV.test(ch) || (ch === ' ' && out.length > 0 && out[out.length - 1].dev);
    const last = out[out.length - 1];
    if (last && last.dev === dev) last.s += ch;
    else out.push({ dev, s: ch });
  }
  return out;
}

/**
 * Draw mixed-script text. Single-line mixed text is laid out run by run with measured widths so that
 * right/center alignment works; longer mixed text falls back to flowing runs left-aligned.
 */
export function mtext(doc: PDFKit.PDFDocument, text: string, x: number | undefined, y: number | undefined, opts: PDFKit.Mixins.TextOptions & { bold?: boolean } = {}) {
  const parts = runs(text || ' ');
  const { bold, ...o } = opts;
  const fontOf = (dev: boolean) => (dev ? (bold ? 'DB' : 'D') : bold ? 'LB' : 'L');
  if (parts.length === 1) {
    doc.font(fontOf(parts[0].dev));
    if (x !== undefined) doc.text(parts[0].s, x, y, o); else doc.text(parts[0].s, o);
    return;
  }
  const startX = x ?? doc.x;
  const startY = y ?? doc.y;
  const widths = parts.map((p) => { doc.font(fontOf(p.dev)); return doc.widthOfString(p.s); });
  const total = widths.reduce((a, b) => a + b, 0);
  const box = o.width ?? doc.page.width - doc.page.margins.right - startX;
  if (total <= box && !text.includes('\n')) {
    let cx = startX + (o.align === 'right' ? box - total : o.align === 'center' ? (box - total) / 2 : 0);
    let lineH = 0;
    parts.forEach((p, i) => {
      doc.font(fontOf(p.dev));
      doc.text(p.s, cx, startY, { lineBreak: false });
      lineH = Math.max(lineH, doc.currentLineHeight(true));
      cx += widths[i];
    });
    doc.x = startX;
    doc.y = startY + lineH;
    return;
  }
  parts.forEach((p, i) => {
    doc.font(fontOf(p.dev));
    const last = i === parts.length - 1;
    if (i === 0) doc.text(p.s, startX, startY, { ...o, align: 'left', continued: !last });
    else doc.text(p.s, { ...o, align: 'left', continued: !last });
  });
}
