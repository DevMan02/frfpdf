import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const fixture = (name: string) => join(import.meta.dirname, '../fixtures', name);

async function open(page: Page, name: string) {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['blob:', 'data:'].includes(url.protocol) && url.hostname !== 'localhost') external.push(r.url());
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles(fixture(name));
  return { external, errors };
}

async function download(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica PDF' }).click();
  const confirm = page.getByRole('button', { name: 'Scarica comunque' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  const file = await downloadPromise;
  return new Uint8Array(readFileSync(await file.path()));
}

async function pdfText(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  return content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
}

/** Clicks an empty spot of page 1, at a fraction of its size. */
async function clickPage(page: Page, fx: number, fy: number) {
  const layer = page.locator('.field-layer').first();
  const box = (await layer.boundingBox())!;
  await layer.click({ position: { x: box.width * fx, y: box.height * fy } });
}

test('flat PDF: finds the blanks, fills them and writes the values into the page', async ({ page }) => {
  const { external, errors } = await open(page, 'flat-underscores.pdf');
  await expect(page.getByText('Trovati 7 spazi da compilare')).toBeVisible();

  await page.getByLabel('Il/La sottoscritto/a', { exact: true }).fill('Mario Rossi');
  await page.getByLabel('Codice fiscale', { exact: true }).fill('RSSMRA80A01F205X');
  // "il ___/___/______" is a date field with the "Oggi" button.
  await page.getByLabel('il', { exact: true }).focus();
  await page.getByRole('button', { name: 'Inserisci la data di oggi: il' }).click();
  await expect(page.getByLabel('il', { exact: true })).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);

  const bytes = await download(page);
  const text = await pdfText(bytes);
  expect(text).toContain('Mario Rossi');
  expect(text).toContain('RSSMRA80A01F205X');
  expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(0);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('scanned PDF: explains it is a scan, finds lines and boxes, lets you write anywhere', async ({ page }) => {
  const { errors } = await open(page, 'scanned.pdf');
  await expect(page.getByRole('status').filter({ hasText: 'Documento scansionato: clicca dove vuoi scrivere.' })).toBeVisible();
  await expect(page.getByText('Trovati 11 spazi da compilare')).toBeVisible();
  await expect(page.getByText('1 campo è già compilato: per correggerlo, scrivici sopra.')).toBeVisible();
  await expect(page.locator('.field')).toHaveCount(12);
  await expect(page.locator('.field--cover')).toHaveCount(1);
  await expect(page.getByText(/Il vecchio contenuto resta nel file/)).toBeVisible();

  // Click on an empty spot: a field appears there, ready to type.
  await clickPage(page, 0.5, 0.05);
  await expect(page.locator('.field')).toHaveCount(13);
  await page.keyboard.type('Nota a margine');
  await page.keyboard.press('Tab');
  await expect(page.locator('.field')).toHaveCount(13);

  // A field added by mistake and left empty goes away.
  await clickPage(page, 0.5, 0.95);
  await expect(page.locator('.field')).toHaveCount(14);
  await page.getByLabel('Campo 1', { exact: true }).focus();
  await expect(page.locator('.field')).toHaveCount(13);

  // Correct the prefilled cell: typing turns the field white.
  const correction = page.locator('.field--cover input');
  await correction.fill('Valore corretto');
  await expect(page.locator('.field--cover.has-value')).toHaveCount(1);

  const text = await pdfText(await download(page));
  expect(text).toContain('Nota a margine');
  expect(text).toContain('Valore corretto');
  expect(errors).toEqual([]);
});

test('"Modifica campi": delete a wrong field, add a checkbox, save as a fillable form', async ({ page }) => {
  await open(page, 'flat-table.pdf');
  await expect(page.getByText('Trovati 13 spazi da compilare')).toBeVisible();
  // "Restrizioni alimentari" already says "Nessuna": it starts with that value.
  await expect(page.getByLabel('Restrizioni alimentari', { exact: true })).toHaveValue('Nessuna');

  await page.getByRole('button', { name: 'Modifica campi' }).click();
  await expect(page.getByText(/Trascina un campo per spostarlo/)).toBeVisible();

  // Keyboard: focus a field box and delete it.
  const first = page.locator('.field--edit').first();
  await first.focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.field--edit')).toHaveCount(13); // 13 empty + 1 prefilled, minus the deleted one

  // Arrow keys move the selected field.
  const second = page.locator('.field--edit').first();
  await second.focus();
  const before = (await second.boundingBox())!;
  await page.keyboard.press('Shift+ArrowDown');
  const after = (await second.boundingBox())!;
  expect(after.y).toBeGreaterThan(before.y + 5);

  // Add a checkbox with a click on the page.
  await page.getByRole('radio', { name: 'Casella' }).check();
  await clickPage(page, 0.8, 0.6);
  await expect(page.locator('.field--edit-checkbox')).toHaveCount(3);

  // "Sostituisci": a field over text already printed, to correct it.
  await page.getByRole('radio', { name: 'Sostituisci' }).check();
  await clickPage(page, 0.3, 0.7);
  await expect(page.getByRole('button', { name: /^Correzione \d+, campo di testo$/ })).toHaveCount(1);

  await page.getByRole('button', { name: 'Fine modifiche' }).click();
  await expect(page.locator('.field--edit')).toHaveCount(0);
  await page.locator('.field--cover input').last().fill('Nuovo testo');

  await page.getByLabel('Blocca i campi compilati').uncheck();
  await expect(page.getByText('I campi diventano veri campi compilabili, anche in altri programmi.')).toBeVisible();
  const form = (await PDFDocument.load(await download(page))).getForm();
  // 12 detected fields left + 1 checkbox + the changed correction; "Nessuna" was not changed, so it stays as it was.
  expect(form.getFields()).toHaveLength(14);
});
