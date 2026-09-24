// Generates the test PDFs in tests/fixtures/. Run with: npm run fixtures
// The generated files are committed, so this only needs to run when they change.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { degrees, PDFDict, PDFDocument, PDFName, PDFString, rgb, StandardFonts } from 'pdf-lib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures');
mkdirSync(OUT, { recursive: true });

const A4 = [595.28, 841.89];

async function writePdf(name, build, postprocess) {
  const doc = await PDFDocument.create();
  // Fixed metadata so regenerated files are byte-identical.
  const epoch = new Date('2026-01-01T00:00:00Z');
  doc.setCreationDate(epoch);
  doc.setModificationDate(epoch);
  doc.setProducer('FrFPDF fixtures');
  doc.setCreator('FrFPDF fixtures');
  await build(doc);
  let bytes = await doc.save({ useObjectStreams: false });
  if (postprocess) {
    // Second pass on the saved file, for things pdf-lib strips during save().
    const again = await PDFDocument.load(bytes, { updateMetadata: false });
    postprocess(again);
    bytes = await again.save({ useObjectStreams: false, updateFieldAppearances: false });
  }
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

// 6. AcroForm with every field type, on two pages.
await writePdf('acroform.pdf', async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const p1 = doc.addPage(A4);
  const label = (page, text, x, y) => page.drawText(text, { x, y, size: 10, font });
  p1.drawText('Modulo di iscrizione', { x: 72, y: 780, size: 20, font });

  label(p1, 'Nome', 72, 730);
  form.createTextField('nome').addToPage(p1, { x: 160, y: 724, width: 160, height: 20 });
  label(p1, 'Cognome', 340, 730);
  form.createTextField('cognome').addToPage(p1, { x: 400, y: 724, width: 120, height: 20 });

  label(p1, 'Codice fiscale', 72, 690);
  const cf = form.createTextField('codice_fiscale');
  cf.setMaxLength(16);
  cf.addToPage(p1, { x: 160, y: 684, width: 200, height: 20 });

  label(p1, 'Data di nascita', 72, 650);
  form.createTextField('data_nascita').addToPage(p1, { x: 160, y: 644, width: 100, height: 20 });

  label(p1, 'Email', 72, 610);
  const email = form.createTextField('email');
  email.setText('mario.rossi@example.com');
  email.addToPage(p1, { x: 160, y: 604, width: 200, height: 20 });

  label(p1, 'Provincia', 72, 570);
  const prov = form.createDropdown('provincia');
  prov.addOptions(['Milano', 'Roma', 'Torino', 'Napoli']);
  prov.addToPage(p1, { x: 160, y: 564, width: 120, height: 20 });

  label(p1, 'Tipo di iscrizione', 72, 530);
  const tipo = form.createRadioGroup('tipo');
  label(p1, 'Ordinaria', 182, 530);
  tipo.addOptionToPage('ordinaria', p1, { x: 160, y: 526, width: 14, height: 14 });
  label(p1, 'Ridotta', 282, 530);
  tipo.addOptionToPage('ridotta', p1, { x: 260, y: 526, width: 14, height: 14 });

  label(p1, 'Note', 72, 490);
  const note = form.createTextField('note');
  note.enableMultiline();
  note.addToPage(p1, { x: 160, y: 400, width: 360, height: 100 });

  label(p1, 'Codice pratica (sola lettura)', 72, 360);
  const code = form.createTextField('codice_pratica');
  code.setText('PR-2026-001');
  code.enableReadOnly();
  code.addToPage(p1, { x: 240, y: 354, width: 120, height: 20 });

  const privacy = form.createCheckBox('privacy');
  privacy.addToPage(p1, { x: 72, y: 316, width: 14, height: 14 });
  label(p1, 'Acconsento al trattamento dei dati', 94, 320);

  const p2 = doc.addPage(A4);
  label(p2, 'Luogo', 72, 760);
  form.createTextField('luogo').addToPage(p2, { x: 160, y: 754, width: 160, height: 20 });
  label(p2, 'Data', 72, 720);
  form.createTextField('data').addToPage(p2, { x: 160, y: 714, width: 100, height: 20 });
  label(p2, 'Firma', 72, 660);
  addSignatureField(doc, p2, 'firma', [160, 620, 400, 680]);
});

// 7. AcroForm on a page with /Rotate 90.
await writePdf('acroform-rotated.pdf', async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  page.drawText('Nome', { x: 72, y: 730, size: 10, font });
  doc.getForm().createTextField('nome').addToPage(page, { x: 160, y: 724, width: 160, height: 20 });
  page.setRotation(degrees(90));
});

// 8. Hybrid XFA: standard AcroForm fields plus an XFA packet.
await writePdf('xfa-hybrid.pdf', async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  page.drawText('Nome', { x: 72, y: 730, size: 10, font });
  const form = doc.getForm();
  form.createTextField('nome').addToPage(page, { x: 160, y: 724, width: 160, height: 20 });
}, addXfaPacket);

// 9. Pure XFA: no AcroForm fields, only the XFA packet and a placeholder page.
await writePdf('xfa-pure.pdf', async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  page.drawText('Please wait... this document requires an XFA-capable viewer.', { x: 72, y: 760, size: 12, font });
}, addXfaPacket);

// 10. Flat form: blanks made of underscores and dots in the text.
await writePdf('flat-underscores.pdf', async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  const line = (text, y, x = 72) => page.drawText(text, { x, y, size: 11, font });
  page.drawText('Dichiarazione', { x: 72, y: 790, size: 18, font });
  line('Il/La sottoscritto/a ________________________________________', 750);
  line('nato/a a ____________________________ il ___/___/______', 725);
  line('Codice fiscale: __________________________', 700);
  line('Email ........................................................', 675);
  line('Luogo e data ____________________', 600);
  line('Firma ________________________', 600, 330);
});

// 11. Flat form: drawn lines, a caption under a line, drawn checkboxes, a big box.
await writePdf('flat-lines.pdf', async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  const black = rgb(0, 0, 0);
  const text = (t, x, y, size = 11) => page.drawText(t, { x, y, size, font });
  const hline = (x1, x2, y) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color: black });

  text('Nome', 72, 760);
  hline(110, 300, 757);
  text('Cognome', 320, 760);
  hline(372, 523, 757);

  // Underlined heading: must not become a field.
  const heading = 'Informativa sulla privacy';
  text(heading, 72, 720);
  hline(72, 72 + font.widthOfTextAtSize(heading, 11), 718);

  // Signature line with the caption below it.
  hline(72, 250, 640);
  text('Firma', 140, 628, 9);

  // Drawn checkboxes.
  page.drawRectangle({ x: 72, y: 590, width: 10, height: 10, borderColor: black, borderWidth: 0.75 });
  text('Sì', 86, 591);
  page.drawRectangle({ x: 130, y: 590, width: 10, height: 10, borderColor: black, borderWidth: 0.75 });
  text('No', 144, 591);

  // Big empty box with its label above.
  text('Note', 72, 526);
  page.drawRectangle({ x: 72, y: 400, width: 451, height: 120, borderColor: black, borderWidth: 0.75 });
});

// 12. Flat form with tables, drawn like Word does (thin filled bars).
await writePdf('flat-table.pdf', async (doc) => {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  const black = rgb(0, 0, 0);
  const text = (t, x, y, size = 10) => page.drawText(t, { x, y, size, font });
  const bar = (x1, y1, x2, y2) =>
    page.drawRectangle({ x: x1, y: y1, width: Math.max(x2 - x1, 0.75), height: Math.max(y2 - y1, 0.75), color: black });
  const grid = (xs, ys) => {
    for (const y of ys) bar(xs[0], y, xs[xs.length - 1] + 0.75, y);
    for (const x of xs) bar(x, ys[ys.length - 1], x, ys[0] + 0.75);
  };

  page.drawText('Lingue', { x: 72, y: 780, size: 14, font });
  const cols = [72, 222, 302, 382, 452, 523];
  grid(cols, [760, 740, 720, 700, 680]);
  ['Lingua', 'Anni di studio', 'Parlato', 'Letto', 'Scritto'].forEach((h, i) => text(h, cols[i] + 4, 746));
  ['Inglese', '13', 'Buono', 'Buono', 'Buono'].forEach((v, i) => text(v, cols[i] + 4, 726));

  // A cell with a small label on top and room below; a cell already filled in.
  grid([72, 222, 523], [640, 600]);
  text('Religione', 76, 630, 8);
  text('Restrizioni alimentari', 226, 630, 8);
  text('Nessuna', 226, 608, 12);

  // A question with Yes/No boxes in the next cell.
  grid([72, 400, 523], [580, 556]);
  text('Fumi?', 76, 564);
  page.drawRectangle({ x: 410, y: 563, width: 10, height: 10, borderColor: black, borderWidth: 0.75 });
  text('Sì', 424, 564);
  page.drawRectangle({ x: 460, y: 563, width: 10, height: 10, borderColor: black, borderWidth: 0.75 });
  text('No', 474, 564);
});

// 13. Scanned form: the whole page is one grey image (no text, no vector lines).
await writePdf('scanned.pdf', async (doc) => {
  const { width, height, pixels } = drawScannedForm();
  const image = await doc.embedPng(encodeGrayPng(width, height, pixels));
  const page = doc.addPage(A4);
  page.drawImage(image, { x: 0, y: 0, width: A4[0], height: A4[1] });
});

// 14. A "photo" of a signature: dark strokes on greyish, slightly noisy paper.
{
  const width = 600;
  const height = 200;
  const pixels = new Uint8Array(width * height);
  let seed = 11;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < pixels.length; i++) pixels[i] = 225 + Math.floor(random() * 20);
  const dot = (cx, cy, r) => {
    for (let y = Math.max(0, cy - r); y < Math.min(height, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x < Math.min(width, cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) pixels[y * width + x] = 35;
      }
    }
  };
  for (let x = 60; x < 540; x++) {
    const y = 100 + Math.round(45 * Math.sin(x / 28) * Math.cos(x / 90));
    dot(x, y, 4);
  }
  writeFileSync(join(OUT, 'signature-photo.png'), encodeGrayPng(width, height, pixels));
}

console.log(`Fixtures written to ${OUT}`);

// ---------------------------------------------------------------------------

/**
 * A 150 dpi A4 "scan": label-like blobs (as if text), a line to write on,
 * a table, two checkboxes, a big box, and a line that is already written on.
 */
function drawScannedForm() {
  const width = 1240;
  const height = 1754;
  const pixels = new Uint8Array(width * height).fill(250);
  // Light noise, like paper grain.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < pixels.length; i += 7) pixels[i] = 235 + Math.floor(random() * 20);
  const fill = (x1, y1, x2, y2, v = 30) => {
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) pixels[y * width + x] = v;
  };
  const hline = (x1, x2, y, t = 3) => fill(x1, y, x2, y + t);
  const vline = (y1, y2, x, t = 3) => fill(x, y1, x + t, y2);
  const rect = (x1, y1, x2, y2, t = 3) => {
    hline(x1, x2, y1, t);
    hline(x1, x2 + t, y2, t);
    vline(y1, y2, x1, t);
    vline(y1, y2, x2, t);
  };
  // "Text": a row of small letter-like blocks.
  const words = (x, y, w, h = 18) => {
    for (let cx = x; cx < x + w; cx += 14) fill(cx, y, cx + 9, y + h);
  };

  words(150, 296, 180); // label
  hline(360, 900, 318); // line to write on

  const xs = [150, 500, 800, 1090];
  const ys = [500, 560, 620, 680];
  for (const y of ys) hline(xs[0], xs[3] + 3, y);
  for (const x of xs) vline(ys[0], ys[3] + 3, x);
  words(170, 520, 150);
  words(520, 520, 120);
  words(820, 520, 110);

  // A row of two cells with a small caption on top: the first one already
  // filled in (a correction field), the second one still empty.
  hline(150, 1093, 710);
  hline(150, 1093, 770);
  for (const x of [150, 600, 1090]) vline(710, 773, x);
  words(170, 716, 90, 8); // caption
  words(170, 740, 200, 20); // value already written
  words(620, 716, 90, 8); // caption only

  rect(150, 800, 176, 826); // checkbox
  words(190, 804, 60);
  rect(300, 800, 326, 826);
  words(340, 804, 60);

  words(150, 866, 100);
  rect(150, 900, 1090, 1200); // big box

  words(170, 1270, 400, 22); // handwriting on the line below
  hline(150, 700, 1300);

  return { width, height, pixels };
}

/** Minimal 8-bit greyscale PNG encoder (pdf-lib only embeds PNG/JPEG). */
function encodeGrayPng(width, height, pixels) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, y * width, width).copy(raw, y * (width + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** pdf-lib cannot create signature fields: build the widget dictionary by hand. */
function addSignatureField(doc, page, name, rect) {
  const form = doc.getForm();
  const ref = doc.context.register(
    doc.context.obj({
      FT: 'Sig',
      T: PDFString.of(name),
      Type: 'Annot',
      Subtype: 'Widget',
      Rect: rect,
      F: 4,
      P: page.ref,
    }),
  );
  page.node.addAnnot(ref);
  form.acroForm.addField(ref);
}

function addXfaPacket(doc) {
  const xdp =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/3.3/">' +
    '<subform name="form1"><field name="nome"/></subform></template></xdp:xdp>';
  // Work on the raw catalog: pdf-lib's getForm() would delete the XFA packet.
  const stream = doc.context.register(doc.context.stream(xdp));
  let acroForm = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (!acroForm) {
    acroForm = doc.context.obj({ Fields: [] });
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(acroForm));
  }
  acroForm.set(PDFName.of('XFA'), stream);
}

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
