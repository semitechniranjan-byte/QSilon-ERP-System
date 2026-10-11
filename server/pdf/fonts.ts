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

/** Draw mixed-script text. Options are passed to pdfkit's text(). */
export function mtext(doc: PDFKit.PDFDocument, text: string, x: number | undefined, y: number | undefined, opts: PDFKit.Mixins.TextOptions & { bold?: boolean } = {}) {
  const parts = runs(text || '');
  if (!parts.length) parts.push({ dev: false, s: ' ' });
  const { bold, ...o } = opts;
  parts.forEach((p, i) => {
    doc.font(p.dev ? (bold ? 'DB' : 'D') : bold ? 'LB' : 'L');
    const last = i === parts.length - 1;
    if (i === 0 && x !== undefined) doc.text(p.s, x, y, { ...o, continued: !last });
    else doc.text(p.s, { ...o, continued: !last });
  });
}
