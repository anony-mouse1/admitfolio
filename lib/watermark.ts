import 'server-only';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

// Per-buyer forensic watermarking.
//
// Every buyer gets their OWN copy of a PDF, stamped with a keyed,
// non-reversible purchase fingerprint. Two marks go on:
//
//   1. A footer on every page - small, readable, hard to crop out of a
//      screenshot without also losing the bottom of the essay.
//   2. A large diagonal wash across the middle - survives being photographed
//      or re-flattened, and makes a casual re-share obviously marked.
//
// The point is NOT to stop copying. It is attribution: any copy that escapes
// carries a code that maps to the buyer and access-IP history in the private
// database. Email addresses and raw IPs never appear in the document. This is
// the deterrent that still survives screenshotting.
//
// pdf-lib cannot encrypt or set owner passwords, and deliberately so - PDF
// permission flags ("no copy", "no print") are advisory. Any cooperating viewer
// honours them and every non-cooperating one ignores them, so they buy nothing
// but a false sense of protection. The no-text-layer viewer is what actually
// blocks selection; see components/EssayReader.tsx.

export type WatermarkIdentity = {
  fingerprint: string;
  viewedAt: Date;
};

// Keep the footer to one line so the stamp never covers essay text.
export function watermarkFooterText(id: WatermarkIdentity): string {
  const when = id.viewedAt.toISOString().slice(0, 10);
  return `Licensed copy ${id.fingerprint} · ${when} · Admitfolio. Inspiration only, not for submission.`;
}

export async function watermarkPdf(input: Buffer, id: WatermarkIdentity): Promise<Buffer> {
  const pdf = await PDFDocument.load(input, {
    // Uploaded PDFs are arbitrary student files; tolerate mildly malformed ones
    // rather than failing a paid buyer's read.
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const footer = watermarkFooterText(id);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();

    // Diagonal wash. Low opacity so the essay stays comfortably readable -
    // this is a forensic mark, not a redaction.
    const diagonal = `ADMITFOLIO ${id.fingerprint}`;
    const diagonalSize = Math.max(14, Math.min(30, (width * 1.1) / Math.max(diagonal.length, 12)));
    page.drawText(diagonal, {
      x: width * 0.12,
      y: height * 0.34,
      size: diagonalSize,
      font,
      color: rgb(0.49, 0.11, 0.18),
      opacity: 0.13,
      rotate: degrees(32),
    });

    // Footer band, sized to fit the page width.
    let footerSize = 7.5;
    while (font.widthOfTextAtSize(footer, footerSize) > width - 36 && footerSize > 4.5) {
      footerSize -= 0.25;
    }
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: footerSize + 10,
      color: rgb(1, 1, 1),
      opacity: 0.82,
    });
    page.drawText(footer, {
      x: 18,
      y: 5,
      size: footerSize,
      font,
      color: rgb(0.36, 0.33, 0.31),
      opacity: 0.95,
    });
  }

  // Document metadata carries the same identity, so even a stripped-and-
  // re-saved copy usually keeps a trace. Cheap to add, occasionally decisive.
  pdf.setTitle('Admitfolio licensed copy');
  pdf.setSubject(`Licensed copy ${id.fingerprint}`);
  pdf.setKeywords([`fingerprint:${id.fingerprint}`]);
  pdf.setProducer('Admitfolio');
  pdf.setCreator('Admitfolio');

  return Buffer.from(await pdf.save());
}
