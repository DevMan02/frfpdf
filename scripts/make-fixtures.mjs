// Generates the test PDFs in tests/fixtures/. Run with: npm run fixtures
// The generated files are committed, so this only needs to run when they change.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures');
mkdirSync(OUT, { recursive: true });

const A4 = [595.28, 841.89];

async function writePdf(name, build) {
  const doc = await PDFDocument.create();
  // Fixed metadata so regenerated files are byte-identical.
  const epoch = new Date('2026-01-01T00:00:00Z');
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);
  doc.setProducer('FrFPDF fixtures');
  doc.setCreator('FrFPDF fixtures');
  await build(doc);
  const bytes = await doc.save({ useObjectStreams: false });
  writeFileSync(join(OUT, name), bytes);
  return bytes;
}

async function labelPage(doc, text, rotation = 0) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  page.drawText(text, { x: 72, y: 760, size: 28, font, color: rgb(0.1, 0.15, 0.3) });
  page.drawText('FrFPDF test fixture', { x: 72, y: 720, size: 12, font });
  page.drawRectangle({ x: 72, y: 72, width: 451, height: 600, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1 });
  if (rotation) page.setRotation(degrees(rotation));
  return page;
}

// 1. Simple 3-page document.
const simple = await writePdf('simple.pdf', async (doc) => {
  for (let i = 1; i <= 3; i++) await labelPage(doc, `Pagina ${i}`);
});

// 2. Pages with /Rotate 0, 90, 180, 270.
await writePdf('rotated.pdf', async (doc) => {
  for (const r of [0, 90, 180, 270]) await labelPage(doc, `Ruotata ${r}`, r);
});

// 3. Valid header, broken body: truncate a real PDF and scramble the rest.
{
  const broken = Buffer.from(simple.slice(0, 400));
  for (let i = 20; i < broken.length; i++) broken[i] = (broken[i] * 7 + 13) & 0xff;
  writeFileSync(join(OUT, 'corrupted.pdf'), broken);
}

// 4. Not a PDF at all, despite the extension.
writeFileSync(join(OUT, 'not-a-pdf.pdf'), 'Questo è un file di testo, non un PDF.\n');

// 5. Password-protected PDF (user password "segreto"), written by hand because
//    pdf-lib cannot encrypt. Standard Security Handler, revision 2 (RC4 40-bit).
writeFileSync(join(OUT, 'protected.pdf'), makeEncryptedPdf('segreto', 'proprietario'));

console.log(`Fixtures written to ${OUT}`);

// ---------------------------------------------------------------------------

function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

function md5(...parts) {
  return createHash('md5').update(Buffer.concat(parts)).digest();
}

function makeEncryptedPdf(userPassword, ownerPassword) {
  const PAD = Buffer.from(
    '28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A',
    'hex',
  );
  const pad = (pw) => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32);
  const id = md5(Buffer.from('frfpdf-protected-fixture'));
  const permissions = -44; // print allowed, modify/copy/annotate denied

  const O = rc4(md5(pad(ownerPassword)).subarray(0, 5), pad(userPassword));
  const pBytes = Buffer.alloc(4);
  pBytes.writeInt32LE(permissions);
  const fileKey = md5(pad(userPassword), O, pBytes, id).subarray(0, 5);
  const U = rc4(fileKey, PAD);

  const objectKey = (num) =>
    md5(fileKey, Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, 0, 0])).subarray(0, 10);

  const content = Buffer.from('BT /F1 28 Tf 72 760 Td (Documento protetto) Tj ET', 'latin1');
  const encContent = rc4(objectKey(4), content);

  const hex = (b) => `<${b.toString('hex')}>`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null, // stream, written separately
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Filter /Standard /V 1 /R 2 /Length 40 /O ${hex(O)} /U ${hex(U)} /P ${permissions} >>`,
  ];

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((body, index) => {
    const num = index + 1;
    offsets.push(offset);
    const parts =
      body === null
        ? [
            Buffer.from(`${num} 0 obj\n<< /Length ${encContent.length} >>\nstream\n`, 'latin1'),
            encContent,
            Buffer.from('\nendstream\nendobj\n', 'latin1'),
          ]
        : [Buffer.from(`${num} 0 obj\n${body}\nendobj\n`, 'latin1')];
    for (const p of parts) {
      chunks.push(p);
      offset += p.length;
    }
  });

  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 6 0 R /ID [${hex(id)} ${hex(id)}] >>\n`,
    `startxref\n${offset}\n%%EOF\n`,
  ].join('');
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}
